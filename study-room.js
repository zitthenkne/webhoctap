import { db, auth, storage } from './firebase-init.js';
import { doc, getDoc, setDoc, onSnapshot, collection, addDoc, query, orderBy, serverTimestamp, deleteDoc, getDocs, updateDoc, writeBatch } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { onAuthStateChanged, signInAnonymously } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-storage.js";
import { showToast } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const canvas = document.getElementById('whiteboard');
    const ctx = canvas.getContext('2d');
    const roomIdDisplay = document.getElementById('room-id-display');
    const shareBtn = document.getElementById('share-room-btn');
    const colorPicker = document.getElementById('color-picker');
    const lineWidth = document.getElementById('line-width');
    const clearCanvasBtn = document.getElementById('clear-canvas-btn');
    const toolBtns = document.querySelectorAll('.tool-btn');
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    const loadingOverlay = document.getElementById('loading-overlay');
    // New DOM elements for image object upload
    const uploadImageObjectBtn = document.getElementById('upload-image-object-btn');
    const imageObjectFileInput = document.getElementById('image-object-file-input');

    // --- Quiz Collaboration DOM Elements ---
    const startCollaborativeQuizBtn = document.getElementById('start-collaborative-quiz-btn');
    const collaborativeQuizModal = document.getElementById('collaborative-quiz-modal');
    const closeCollaborativeQuizModalBtn = document.getElementById('close-collaborative-quiz-modal-btn');
    const quizUploadArea = document.getElementById('quiz-upload-area');
    const quizFileInput = document.getElementById('quizFileInput');
    const quizFileInfo = document.getElementById('quizFileInfo');
    const quizFileNameSpan = document.getElementById('quizFileName');
    const quizQuestionCountInfo = document.getElementById('quiz-question-count-info');
    const uploadQuizFileArea = document.getElementById('upload-quiz-file-area');
    const startQuizCollaborationBtn = document.getElementById('start-quiz-collaboration-btn');
    const collaborativeQuizDisplay = document.getElementById('collaborative-quiz-display');
    const collaborativeQuizProgressFill = document.getElementById('collaborative-quiz-progress-fill');
    const currentQuestionText = document.getElementById('current-question-text');
    const quizOptionsArea = document.getElementById('quiz-options-area');
    const prevQuestionBtn = document.getElementById('prev-question-btn');
    const nextQuestionBtn = document.getElementById('next-question-btn');
    const questionCounter = document.getElementById('question-counter');
    const finishQuizCollaborationBtn = document.getElementById('finish-quiz-collaboration-btn');

    // --- State Management ---
    let roomId = null;
    let roomUnsubscribe = null;
    let isDrawing = false; // For pen, line, eraser
    let isDragging = false; // For select tool
    let currentTool = 'pen';

    // Object-based drawing state
    let canvasObjects = [];
    let currentPath = []; // For building a 'pen' stroke
    let selectedObject = null;
    let dragOffsetX, dragOffsetY;

    // Tool-specific state
    let startX, startY;

    // Undo/Redo state (local only)
    let history = [];
    let historyIndex = -1;

    // Background state
    let currentBackgroundUrl = null;
    let currentBackgroundType = null;
    const backgroundImage = new Image();
    // Important for loading images from Firebase Storage
    backgroundImage.crossOrigin = "anonymous";

    // --- Quiz Collaboration State ---
    let currentQuizData = null; // Stores questions, hostId, currentQuestionIndex, etc.
    let currentQuestionIndex = 0;
    let isHost = false; // True if current user is the host of the collaborative quiz session
    let quizSessionUnsubscribe = null; // Listener for quiz session changes

    // --- Helper to get coordinates for mouse and touch events ---
    function getEventCoords(e) {
        let x, y;
        const rect = canvas.getBoundingClientRect();

        if (e.touches && e.touches.length > 0) {
            // For touchstart and touchmove
            x = e.touches[0].clientX - rect.left;
            y = e.touches[0].clientY - rect.top;
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            // For touchend
            x = e.changedTouches[0].clientX - rect.left;
            y = e.changedTouches[0].clientY - rect.top;
        } else {
            // For mouse events
            x = e.offsetX;
            y = e.offsetY;
        }
        return { x, y };
    }
    // --- Canvas Setup ---
    function resizeCanvas() {
        const container = document.getElementById('canvas-container');
        const dpr = window.devicePixelRatio || 1;
        const rect = container.getBoundingClientRect();

        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;

        redrawCanvas();
    }

    // --- Drawing & Redrawing ---
    function redrawCanvas() {
        const logicalWidth = canvas.width / (window.devicePixelRatio || 1);
        const logicalHeight = canvas.height / (window.devicePixelRatio || 1);
        ctx.clearRect(0, 0, logicalWidth, logicalHeight);

        // Draw background image if it's loaded
        if (currentBackgroundUrl && backgroundImage.src === currentBackgroundUrl && backgroundImage.complete) {
            ctx.drawImage(backgroundImage, 0, 0, logicalWidth, logicalHeight);
        }

        // Draw all objects
        canvasObjects.forEach(obj => drawObject(obj));

        // Draw selection box if an object is selected
        if (selectedObject) {
            drawSelectionBox(selectedObject);
        }
    }

    function drawObject(obj) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = (obj.tool === 'eraser') ? 'destination-out' : 'source-over';
        ctx.strokeStyle = obj.color;
        ctx.lineWidth = obj.width;

        ctx.beginPath();
        switch (obj.type) {
            case 'stroke':
                if (obj.path.length === 0) return;
                ctx.moveTo(obj.path[0].x, obj.path[0].y);
                for (let i = 1; i < obj.path.length; i++) {
                    ctx.lineTo(obj.path[i].x, obj.path[i].y);
                }
                break;
            case 'image':
                if (obj.imgElement && obj.imgElement.complete) {
                    ctx.drawImage(obj.imgElement, obj.x, obj.y, obj.width, obj.height);
                }
                break;
            case 'line':
                ctx.moveTo(obj.startX, obj.startY);
                ctx.lineTo(obj.endX, obj.endY);
                break;
        }
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over'; // Reset composite operation
    }

    function drawSelectionBox(obj) {
        if (!obj.bounds) return;
        ctx.strokeStyle = '#FF69B4';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(obj.bounds.minX - 5, obj.bounds.minY - 5, obj.bounds.maxX - obj.bounds.minX + 10, obj.bounds.maxY - obj.bounds.minY + 10);
        ctx.setLineDash([]);
    }

    // --- Action Handlers (Mouse/Touch Events) ---
    function startAction(e) {
        e.preventDefault();
        const { x, y } = getEventCoords(e);
        startX = x;
        startY = y;

        if (currentTool === 'select') {
            selectedObject = getObjectAtPoint(x, y);
            if (selectedObject) {
                isDragging = true;
                dragOffsetX = x - selectedObject.bounds.minX;
                dragOffsetY = y - selectedObject.bounds.minY;
                canvas.style.cursor = 'grabbing';
            }
            redrawCanvas();
            return;
        }

        isDrawing = true;
        if (currentTool === 'pen' || currentTool === 'eraser') {
            currentPath = [{ x, y }];
        }
    }

    function moveAction(e) {
        e.preventDefault();
        if (!isDrawing && !isDragging) return;
        const { x, y } = getEventCoords(e);

        if (isDragging && selectedObject) {
            const deltaX = (x - dragOffsetX) - selectedObject.bounds.minX;
            const deltaY = (y - dragOffsetY) - selectedObject.bounds.minY;
            moveObject(selectedObject, deltaX, deltaY);
            redrawCanvas();
            return;
        }

        if (isDrawing) {
            if (currentTool === 'pen' || currentTool === 'eraser') {
                // Draw the latest segment for immediate feedback
                const lastPoint = currentPath[currentPath.length - 1];
                const tempObj = {
                    type: 'stroke', tool: currentTool, path: [{x: lastPoint.x, y: lastPoint.y}, {x, y}],
                    color: colorPicker.value, width: lineWidth.value
                };
                drawObject(tempObj);
                currentPath.push({ x, y });
            } else if (currentTool === 'line') {
                redrawCanvas(); // Redraw to clear previous temp line
                const tempLine = { type: 'line', startX, startY, endX: x, endY: y, color: colorPicker.value, width: lineWidth.value };
                drawObject(tempLine);
            }
        }
    }

    async function endAction(e) {
        e.preventDefault();

        // Handle the end of a drag-and-drop action for the 'select' tool
        if (isDragging && selectedObject) {
            isDragging = false;
            canvas.style.cursor = 'grab';
            await updateObjectInFirestore(selectedObject);
            saveHistory();
            return; // Action is complete, no need to process other tools
        }

        // If not dragging and not drawing, do nothing
        if (!isDrawing) return;
        isDrawing = false;

        let newObjectData = null;
        if (currentTool === 'pen' || currentTool === 'eraser') {
            if (currentPath.length < 2) {
                currentPath = [];
                return;
            }
            newObjectData = { type: 'stroke', tool: currentTool, path: currentPath, color: colorPicker.value, width: parseInt(lineWidth.value, 10) };
        } else if (currentTool === 'line') {
            const { x, y } = getEventCoords(e);
            if (x === startX && y === startY) { // Prevent zero-length lines on a simple click
                currentPath = [];
                return;
            }
            newObjectData = { type: 'line', startX, startY, endX: x, endY: y, color: colorPicker.value, width: parseInt(lineWidth.value, 10) };
        }

        if (newObjectData) {
            newObjectData.author = auth.currentUser ? auth.currentUser.uid : 'anonymous';
            newObjectData.bounds = calculateBounds(newObjectData);
            const docRef = await sendObjectToFirestore(newObjectData);
            if (docRef) { // Check if send was successful
                canvasObjects.push({ ...newObjectData, id: docRef.id });
                redrawCanvas();
                saveHistory();
            }
        }
        currentPath = [];
    }

    // --- Object Manipulation ---
    function calculateBounds(obj) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        if (obj.type === 'stroke') {
            obj.path.forEach(p => {
                minX = Math.min(minX, p.x);
                minY = Math.min(minY, p.y);
                maxX = Math.max(maxX, p.x);
                maxY = Math.max(maxY, p.y);
            });
        } else if (obj.type === 'line') {
            minX = Math.min(obj.startX, obj.endX);
            minY = Math.min(obj.startY, obj.endY);
            maxX = Math.max(obj.startX, obj.endX);
            maxY = Math.max(obj.startY, obj.endY);
        } else if (obj.type === 'image') {
            minX = obj.x;
            minY = obj.y;
            maxX = obj.x + obj.width;
            maxY = obj.y + obj.height;
        }
        return { minX, minY, maxX, maxY };
    }

    function getObjectAtPoint(x, y) {
        // Iterate backwards to select the top-most object
        for (let i = canvasObjects.length - 1; i >= 0; i--) {
            const obj = canvasObjects[i];
            // Ensure bounds exist, if not, calculate them (for backward compatibility or corrupted data)
            if (!obj.bounds) {
                obj.bounds = calculateBounds(obj);
            }
            if (obj.bounds && x >= obj.bounds.minX && x <= obj.bounds.maxX && y >= obj.bounds.minY && y <= obj.bounds.maxY) {
                // More precise hit-testing could be added here
                return obj;
            }
        }
        return null;
    }

    function moveObject(obj, deltaX, deltaY) {
        if (obj.type === 'stroke') {
            obj.path.forEach(p => {
                p.x += deltaX;
                p.y += deltaY;
            });
        } else if (obj.type === 'line') {
            obj.startX += deltaX;
            obj.startY += deltaY;
            obj.endX += deltaX;
            obj.endY += deltaY;
        }
        else if (obj.type === 'image') {
            obj.x += deltaX;
            obj.y += deltaY;
        }
        obj.bounds.minX += deltaX;
        obj.bounds.minY += deltaY;
        obj.bounds.maxX += deltaX;
        obj.bounds.maxY += deltaY;
    }

    // --- History (Undo/Redo) ---
    function saveHistory() {
        if (historyIndex < history.length - 1) {
            history = history.slice(0, historyIndex + 1);
        }
        history.push(JSON.parse(JSON.stringify(canvasObjects)));
        historyIndex++;
        updateUndoRedoButtons();
    }

    function undo() {
        if (historyIndex > 0) {
            historyIndex--;
            canvasObjects = JSON.parse(JSON.stringify(history[historyIndex]));
            redrawCanvas();
            updateUndoRedoButtons();
        }
    }

    function redo() {
        if (historyIndex < history.length - 1) {
            historyIndex++;
            canvasObjects = JSON.parse(JSON.stringify(history[historyIndex]));
            redrawCanvas();
            updateUndoRedoButtons();
        }
    }

    function updateUndoRedoButtons() {
        undoBtn.disabled = historyIndex <= 0;
        redoBtn.disabled = historyIndex >= history.length - 1;
        undoBtn.classList.toggle('opacity-50', undoBtn.disabled);
        redoBtn.classList.toggle('opacity-50', redoBtn.disabled);
    }

    // --- Firestore & Realtime ---
    async function sendObjectToFirestore(data) {
        if (!roomId) return;
        try {
            const roomDrawingsRef = collection(db, 'study_rooms', roomId, 'drawings');
            return await addDoc(roomDrawingsRef, { ...data, timestamp: serverTimestamp() });
        } catch (error) {
            console.error("Error sending object data:", error);
        }
    }

    async function updateObjectInFirestore(obj) {
        if (!roomId || !obj.id) return;
        try {
            const objRef = doc(db, 'study_rooms', roomId, 'drawings', obj.id);

            // Create a plain object with only the fields that can be moved/changed.
            // This prevents sending the entire object, which might contain local-only state
            // or complex references in the future, and is more efficient and robust.
            const dataToUpdate = {
                bounds: obj.bounds,
            };

            if (obj.type === 'stroke') {
                dataToUpdate.path = obj.path;
            } else if (obj.type === 'line') {
                dataToUpdate.startX = obj.startX;
                dataToUpdate.startY = obj.startY;
                dataToUpdate.endX = obj.endX;
                dataToUpdate.endY = obj.endY;
            }
            else if (obj.type === 'image') {
                dataToUpdate.x = obj.x;
                dataToUpdate.y = obj.y;
            }

            await updateDoc(objRef, dataToUpdate);
        } catch (error) {
            console.error("Error updating object in Firestore:", error);
            showToast('Không thể đồng bộ thay đổi vị trí.', 'error');
        }
    }

    function listenToRoomChanges() {
        if (roomUnsubscribe) roomUnsubscribe();

        const roomDrawingsRef = collection(db, 'study_rooms', roomId, 'drawings');
        const q = query(roomDrawingsRef, orderBy("timestamp"));

        roomUnsubscribe = onSnapshot(q, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                // Ignore local changes that have not yet been written to the server.
                // The UI is already updated optimistically. This prevents the object
                // from "snapping back" to its old position due to the listener echo.
                if (change.doc.metadata.hasPendingWrites) {
                    return;
                }
                const data = change.doc.data();
                const id = change.doc.id;

                if (change.type === "added") {
                    // Prevent echo by checking if we already have this object
                    if (!canvasObjects.some(obj => obj.id === id)) {
                        canvasObjects.push({ ...data, id });
                        // If it's an image, load it
                        if (data.type === 'image') {
                            const img = new Image();
                            img.crossOrigin = "anonymous"; // Important for CORS if image is from different origin
                            img.src = data.url;
                            img.onload = () => {
                                const loadedObj = canvasObjects.find(o => o.id === id);
                                if (loadedObj) loadedObj.imgElement = img; // Store the loaded image element
                                redrawCanvas();
                            };
                        }
                        redrawCanvas();
                    }
                } else if (change.type === "modified") {
                    const index = canvasObjects.findIndex(obj => obj.id === id);
                    if (index !== -1) {
                        // Update properties of the existing object in place
                        // This helps preserve the object reference if other parts of the code hold it
                        Object.assign(canvasObjects[index], data);
                        // If it's an image and URL changed or imgElement not present, reload
                        if (data.type === 'image' && (!canvasObjects[index].imgElement || canvasObjects[index].imgElement.src !== data.url)) {
                            const img = new Image();
                            img.crossOrigin = "anonymous";
                            img.src = data.url;
                            img.onload = () => {
                                canvasObjects[index].imgElement = img;
                                redrawCanvas();
                            };
                        }
                        canvasObjects[index].id = id; // Ensure ID is preserved
                        redrawCanvas();
                    }
                } else if (change.type === "removed") {
                    canvasObjects = canvasObjects.filter(obj => obj.id !== id);
                    redrawCanvas();
                }
            });
        });
    }

    async function clearAllDrawings() {
        if (!roomId) return;
        if (!confirm('Bạn có chắc muốn xóa toàn bộ bảng? Hành động này sẽ xóa cho tất cả mọi người.')) return;

        // Clear locally for instant feedback
        canvasObjects = [];
        saveHistory();
        redrawCanvas();

        // Delete all documents in the 'drawings' subcollection in a batch
        const drawingsRef = collection(db, 'study_rooms', roomId, 'drawings');
        const querySnapshot = await getDocs(drawingsRef);
        const batch = writeBatch(db);
        querySnapshot.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
    }

    // --- Image Object Management ---
    async function handleImageObjectUpload(e) {
        const file = e.target.files[0];
        if (!file || !roomId) return;

        if (!file.type.startsWith('image/')) {
            showToast('Vui lòng chọn một file ảnh (PNG, JPG...).', 'warning');
            return;
        }
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            showToast('Kích thước file quá lớn (tối đa 5MB).', 'warning');
            return;
        }

        loadingOverlay.classList.remove('hidden');
        showToast('Đang tải ảnh lên bảng...', 'info');

        try {
            const storagePath = `drawing_images/${roomId}/${Date.now()}-${file.name}`;
            const storageRef = ref(storage, storagePath);
            const uploadResult = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(uploadResult.ref);

            // Get image dimensions to set initial size on canvas
            const img = new Image();
            img.src = downloadURL;
            await new Promise(resolve => img.onload = resolve); // Wait for image to load to get dimensions

            const canvasLogicalWidth = canvas.width / (window.devicePixelRatio || 1);
            const canvasLogicalHeight = canvas.height / (window.devicePixelRatio || 1);

            // Calculate initial size and position, scale down if too large
            let displayWidth = img.width;
            let displayHeight = img.height;
            const maxWidth = canvasLogicalWidth * 0.8; // Max 80% of canvas width
            const maxHeight = canvasLogicalHeight * 0.8; // Max 80% of canvas height

            if (displayWidth > maxWidth) {
                displayHeight = (displayHeight / displayWidth) * maxWidth;
                displayWidth = maxWidth;
            }
            if (displayHeight > maxHeight) {
                displayWidth = (displayWidth / displayHeight) * maxHeight;
                displayHeight = maxHeight;
            }

            const initialX = (canvasLogicalWidth - displayWidth) / 2;
            const initialY = (canvasLogicalHeight - displayHeight) / 2;

            const newImageObject = {
                type: 'image',
                url: downloadURL,
                storagePath: storagePath, // Store path for deletion from storage if needed later
                x: initialX,
                y: initialY,
                width: displayWidth,
                height: displayHeight,
                author: auth.currentUser ? auth.currentUser.uid : 'anonymous',
                timestamp: serverTimestamp() // Add timestamp for ordering
            };
            newImageObject.bounds = calculateBounds(newImageObject); // Calculate bounds for selection

            await sendObjectToFirestore(newImageObject); // This will add to canvasObjects via listener
            showToast('Đã tải ảnh lên bảng!', 'success');
        } catch (error) {
            console.error("Error uploading image object:", error);
            showToast('Tải ảnh lên bảng thất bại.', 'error');
        } finally {
            loadingOverlay.classList.add('hidden');
            if (imageObjectFileInput) imageObjectFileInput.value = ''; // Reset file input
        }
    }

    // --- Quiz Collaboration Functions ---

    /**
     * Parses an Excel/CSV file into a structured array of quiz questions.
     * Assumes the first column is the question, and subsequent columns are options.
     * @param {File} file - The Excel (.xlsx, .xls) or CSV file.
     * @returns {Promise<Array<Object>>} - An array of question objects.
     */
    async function parseQuizFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }); // Get data as array of arrays

                const questions = [];
                // Assuming first row is header or can be skipped, start from second row (index 1)
                // Or, if no header, start from index 0
                const startRowIndex = 0; // Adjust if your file has a header row

                for (let i = startRowIndex; i < json.length; i++) {
                    const row = json[i];
                    if (!row || row.length === 0 || !String(row[0]).trim()) {
                        continue; // Skip empty rows or rows with empty question
                    }

                    const questionText = String(row[0]).trim(); // First column is question
                    const options = [];
                    // Start from index 1 for options
                    for (let j = 1; j < row.length; j++) {
                        const optionText = String(row[j]).trim();
                        if (optionText) { // Only add non-empty options
                            options.push(optionText);
                        }
                    }

                    if (options.length === 0) {
                        console.warn(`Question "${questionText}" has no options and will be skipped.`);
                        continue; // Skip questions without any options
                    }

                    questions.push({
                        question: questionText,
                        options: options, // Array of answer options
                        hostSelectedAnswerIndex: null // Host will select this later
                    });
                }
                resolve(questions);
            };
            reader.onerror = (error) => {
                reject(error);
            };
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Renders the current quiz question and its options.
     * Updates UI based on whether the user is the host or a participant.
     */
    function renderQuizQuestion() {
        if (!currentQuizData || !currentQuizData.questions || currentQuizData.questions.length === 0) {
            currentQuestionText.textContent = 'Không có câu hỏi nào.';
            quizOptionsArea.innerHTML = '';
            questionCounter.textContent = '0 / 0';
            collaborativeQuizProgressFill.style.width = '0%';
            prevQuestionBtn.disabled = true;
            nextQuestionBtn.disabled = true;
            finishQuizCollaborationBtn.classList.add('hidden');
            return;
        }

        const totalQuestions = currentQuizData.questions.length;
        const currentQ = currentQuizData.questions[currentQuestionIndex];

        currentQuestionText.textContent = `${currentQuestionIndex + 1}. ${currentQ.question}`;
        quizOptionsArea.innerHTML = ''; // Clear previous options

        currentQ.options.forEach((option, index) => {
            const optionDiv = document.createElement('div');
            optionDiv.className = `p-3 border rounded-lg cursor-pointer transition duration-200 ease-in-out flex items-center gap-2`;
            optionDiv.innerHTML = `<span class="font-bold text-[#FF69B4]">${String.fromCharCode(65 + index)}.</span> <span>${option}</span>`;
            optionDiv.dataset.index = index;

            // Highlight selected answer by host
            if (currentQ.hostSelectedAnswerIndex === index) {
                optionDiv.classList.add('bg-[#FFB6C1]', 'border-[#FF69B4]', 'font-semibold');
            } else {
                optionDiv.classList.add('bg-white', 'border-gray-200', 'hover:bg-pink-50');
            }

            // Allow all users to click, but only host's click updates shared state
            optionDiv.addEventListener('click', async () => {
                if (isHost) { // Only host's selection affects the shared state
                    // Host selects an answer
                    if (currentQ.hostSelectedAnswerIndex === index) {
                        // Deselect if already selected
                        currentQ.hostSelectedAnswerIndex = null;
                    } else {
                        currentQ.hostSelectedAnswerIndex = index;
                    }
                    // Update in Firestore to sync with all participants
                    const quizSessionRef = doc(db, 'study_rooms', roomId, 'quizSession', 'current');
                    await updateDoc(quizSessionRef, {
                        questions: currentQuizData.questions // Send the entire updated questions array
                    });
                    // UI will be re-rendered by the onSnapshot listener
                } else {
                    // For participants, clicking only provides local visual feedback (optional)
                    // You could add a temporary visual highlight here for the participant
                    // For now, we'll just show a toast that only the host can select
                    showToast('Chỉ chủ phòng mới có thể chọn đáp án chính thức.', 'info');
                }
            });
            quizOptionsArea.appendChild(optionDiv);
        });

        // Update navigation buttons and progress
        prevQuestionBtn.disabled = currentQuestionIndex === 0 || !isHost;
        nextQuestionBtn.disabled = currentQuestionIndex === totalQuestions - 1 || !isHost;
        questionCounter.textContent = `${currentQuestionIndex + 1} / ${totalQuestions}`;
        const progress = ((currentQuestionIndex + 1) / totalQuestions) * 100;
        collaborativeQuizProgressFill.style.width = `${progress}%`;

        // Show/hide finish button
        if (isHost && currentQuestionIndex === totalQuestions - 1) {
            finishQuizCollaborationBtn.classList.remove('hidden');
        } else {
            finishQuizCollaborationBtn.classList.add('hidden');
        }
    }

    /**
     * Listens to real-time changes in the collaborative quiz session in Firestore.
     */
    function listenToQuizSessionChanges() {
        if (quizSessionUnsubscribe) quizSessionUnsubscribe(); // Unsubscribe from previous listener if any

        const quizSessionRef = doc(db, 'study_rooms', roomId, 'quizSession', 'current');

        quizSessionUnsubscribe = onSnapshot(quizSessionRef, (docSnapshot) => {
            if (docSnapshot.exists() && docSnapshot.data().questions && docSnapshot.data().questions.length > 0) {
                const quizSessionData = docSnapshot.data();
                currentQuizData = quizSessionData;
                currentQuestionIndex = quizSessionData.currentQuestionIndex || 0;
                isHost = (auth.currentUser && auth.currentUser.uid === quizSessionData.hostId);

                // Show quiz display and hide upload area
                quizUploadArea.classList.add('hidden');
                collaborativeQuizDisplay.classList.remove('hidden');
                collaborativeQuizModal.classList.remove('hidden'); // Ensure modal is visible if data exists

                renderQuizQuestion();
            } else {
                // No active quiz session or session was cleared
                currentQuizData = null;
                currentQuestionIndex = 0;
                isHost = false; // Reset host status
                collaborativeQuizDisplay.classList.add('hidden');
                quizUploadArea.classList.remove('hidden'); // Show upload area

                // Adjust UI based on whether current user is potential host
                if (auth.currentUser) { // Any authenticated user can upload a quiz, so show the upload area
                    uploadQuizFileArea.classList.remove('hidden'); // Make the drag/drop area visible
                    startQuizCollaborationBtn.disabled = true; // Disable until file is parsed
                    quizFileInfo.classList.add('hidden'); // Hide file info initially
                } else {
                    // Not authenticated, cannot upload
                    uploadQuizFileArea.classList.add('hidden');
                    quizFileInfo.classList.add('hidden');
                    quizUploadArea.querySelector('p').textContent = 'Vui lòng đăng nhập để tải lên file câu hỏi.';
                }
            }
        });
    }

    // --- Room Management ---
    async function initRoom() {
        loadingOverlay.classList.remove('hidden');
        const urlParams = new URLSearchParams(window.location.search);
        roomId = urlParams.get('id');

        if (roomId) {
            const roomRef = doc(db, 'study_rooms', roomId);
            const roomSnap = await getDoc(roomRef);
            if (!roomSnap.exists()) {
                alert("Phòng không tồn tại!");
                window.location.href = 'index.html';
                return;
            }
            // Listen for room-level changes (like background)
            onSnapshot(roomRef, (docSnap) => {
                const roomData = docSnap.data();
                if (roomData && roomData.background) {
                    if (roomData.background.url !== currentBackgroundUrl) {
                        currentBackgroundUrl = roomData.background.url;
                        currentBackgroundType = roomData.background.fileType;
                        backgroundImage.src = currentBackgroundUrl;
                        backgroundImage.onload = () => redrawCanvas();
                    }
                } else if (currentBackgroundUrl) {
                    currentBackgroundUrl = null;
                    currentBackgroundType = null;
                    redrawCanvas();
                }
            });

        } else {
            const newRoomRef = doc(collection(db, 'study_rooms'));
            roomId = newRoomRef.id;
            await setDoc(newRoomRef, { // Use setDoc for initial creation
                createdAt: serverTimestamp(),
                owner: auth.currentUser ? auth.currentUser.uid : 'anonymous'
            });
            window.history.replaceState({}, '', `?id=${roomId}`);
        }

        roomIdDisplay.textContent = roomId;

        // Fetch initial drawings
        const drawingsRef = collection(db, 'study_rooms', roomId, 'drawings');
        const q = query(drawingsRef, orderBy("timestamp", "asc"));
        const querySnapshot = await getDocs(q); // Use getDocs for initial load
        canvasObjects = querySnapshot.docs.map(docSnap => {
            const data = docSnap.data();
            const obj = { id: docSnap.id, ...data };
            if (obj.type === 'image') {
                const img = new Image();
                img.crossOrigin = "anonymous"; // Important for CORS if image is from different origin
                img.src = obj.url;
                obj.imgElement = img; // Store the image element
                img.onload = () => redrawCanvas(); // Redraw once image is loaded
            }
            return obj;
        });

        saveHistory();
        redrawCanvas();
        listenToRoomChanges();
        listenToQuizSessionChanges(); // Listen for quiz session changes
        loadingOverlay.classList.add('hidden');
    }

    // --- Event Listeners ---
    window.addEventListener('resize', resizeCanvas);
    canvas.addEventListener('mousedown', startAction);
    canvas.addEventListener('mousemove', moveAction);
    canvas.addEventListener('mouseup', endAction);
    canvas.addEventListener('mouseleave', endAction); // End action if mouse leaves canvas
    canvas.addEventListener('touchstart', startAction, { passive: false });
    canvas.addEventListener('touchmove', moveAction, { passive: false });
    canvas.addEventListener('touchend', endAction);

    shareBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(window.location.href)
            .then(() => showToast('Đã sao chép link phòng!', 'success'))
            .catch(() => showToast('Lỗi khi sao chép link.', 'error'));
    });
    
    toolBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tool = btn.dataset.tool;
            if (!tool) return;

            document.querySelector('.tool-btn.active')?.classList.remove('active');
            btn.classList.add('active');
            currentTool = tool;
            selectedObject = null; // Deselect object when changing tool
            canvas.style.cursor = (currentTool === 'select') ? 'grab' : 'crosshair';
            redrawCanvas();
        });
    });

    clearCanvasBtn.addEventListener('click', clearAllDrawings);
    undoBtn.addEventListener('click', undo);
    redoBtn.addEventListener('click', redo);

    // New image object upload listeners
    if (uploadImageObjectBtn && imageObjectFileInput) {
        uploadImageObjectBtn.addEventListener('click', () => imageObjectFileInput.click());
        imageObjectFileInput.addEventListener('change', handleImageObjectUpload);
    }

    // --- Quiz Collaboration Event Listeners ---
    // Event listener to open the collaborative quiz modal
    startCollaborativeQuizBtn.addEventListener('click', async () => {
        collaborativeQuizModal.classList.remove('hidden');
        // The listenToQuizSessionChanges will handle showing the correct area (upload vs display)
        // based on whether a quiz session already exists.
    });

    closeCollaborativeQuizModalBtn.addEventListener('click', () => {
        // Close the modal and reset its state
        collaborativeQuizModal.classList.add('hidden');
        // Reset quiz state when modal is closed
        currentQuizData = null;
        currentQuestionIndex = 0;
        isHost = false;
        quizFileInfo.classList.add('hidden');
        startQuizCollaborationBtn.disabled = true; // Disable start button until file is parsed
        collaborativeQuizDisplay.classList.add('hidden');
        quizUploadArea.classList.remove('hidden'); // Show upload area by default for next open
        if (quizSessionUnsubscribe) { // Unsubscribe from quiz session if modal is closed
            quizSessionUnsubscribe();
            quizSessionUnsubscribe = null;
        }
    });

    // Event listener for when a file is selected via the input
    quizFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) {
            quizFileInfo.classList.add('hidden');
            startQuizCollaborationBtn.disabled = true;
            return;
        }

        quizFileNameSpan.textContent = file.name;
        quizFileInfo.classList.remove('hidden');
        startQuizCollaborationBtn.disabled = true; // Disable until parsed

        try {
            const questions = await parseQuizFile(file);
            quizQuestionCountInfo.textContent = `Tìm thấy ${questions.length} câu hỏi.`;
            currentQuizData = {
                questions: questions, // Parsed questions
                hostId: auth.currentUser ? auth.currentUser.uid : null, // Mark current user as host
                hostName: auth.currentUser ? auth.currentUser.displayName || 'Ẩn danh' : 'Ẩn danh',
                currentQuestionIndex: 0,
                quizTitle: file.name.split('.').slice(0, -1).join('.') // Use filename as default title
            };
            startQuizCollaborationBtn.disabled = false; // Enable start button
        } catch (error) {
            console.error("Error parsing quiz file:", error);
            showToast('Lỗi khi đọc file. Vui lòng kiểm tra định dạng.', 'error');
            quizFileInfo.classList.add('hidden');
            startQuizCollaborationBtn.disabled = true;
        }
    });

    // Event listeners for drag and drop functionality
    // Handle drag over event
    uploadQuizFileArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadQuizFileArea.classList.add('border-[#FF69B4]', 'bg-pink-100');
    });

    // Handle drag leave event
    uploadQuizFileArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        uploadQuizFileArea.classList.remove('border-[#FF69B4]', 'bg-pink-100');
    });

    uploadQuizFileArea.addEventListener('drop', (e) => {
        // Handle dropped files
        e.preventDefault();
        e.stopPropagation();
        uploadQuizFileArea.classList.remove('border-[#FF69B4]', 'bg-pink-100');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            quizFileInput.files = files; // Assign dropped files to the input
            quizFileInput.dispatchEvent(new Event('change')); // Trigger change event
        }
    });

    // Handle click on the drag/drop area to open file dialog
    uploadQuizFileArea.addEventListener('click', () => {
        quizFileInput.click();
    });

    // Event listener for the "Start Quiz Collaboration" button
    // This button is only visible to the host after a file is uploaded and parsed.
    startQuizCollaborationBtn.addEventListener('click', async () => {
        if (!currentQuizData || !roomId) { // Removed !isHost check here, as anyone can start
            showToast('Không thể bắt đầu. Vui lòng tải file.', 'error');
            return;
        }
        loadingOverlay.classList.remove('hidden');
        try {
            const quizSessionRef = doc(db, 'study_rooms', roomId, 'quizSession', 'current');
            // When starting, the current user becomes the host of this quiz session
            currentQuizData.hostId = auth.currentUser ? auth.currentUser.uid : null;
            currentQuizData.hostName = auth.currentUser ? auth.currentUser.displayName || 'Ẩn danh' : 'Ẩn danh';
            await setDoc(quizSessionRef, currentQuizData); // Set initial quiz data
            showToast('Đã bắt đầu phiên trắc nghiệm!', 'success');
            // UI will be updated by the onSnapshot listener
        } catch (error) {
            console.error("Error starting quiz collaboration:", error);
            showToast('Lỗi khi bắt đầu phiên trắc nghiệm.', 'error');
        } finally {
            loadingOverlay.classList.add('hidden');
        }
    });

    // Event listener for the "Previous Question" button
    // Navigate questions
    prevQuestionBtn.addEventListener('click', async () => {
        if (isHost && currentQuizData && currentQuestionIndex > 0) {
            currentQuestionIndex--;
            const quizSessionRef = doc(db, 'study_rooms', roomId, 'quizSession', 'current');
            await updateDoc(quizSessionRef, { currentQuestionIndex: currentQuestionIndex });
        }
    });

    // Event listener for the "Next Question" button
    nextQuestionBtn.addEventListener('click', async () => {
        if (isHost && currentQuizData && currentQuestionIndex < currentQuizData.questions.length - 1) {
            currentQuestionIndex++;
            const quizSessionRef = doc(db, 'study_rooms', roomId, 'quizSession', 'current');
            await updateDoc(quizSessionRef, { currentQuestionIndex: currentQuestionIndex });
        }
    });

    // Finish and Save Quiz
    // This button is only visible to the host on the last question.
    finishQuizCollaborationBtn.addEventListener('click', async () => {
        if (!currentQuizData || !roomId || !isHost) {
            showToast('Không thể hoàn thành. Vui lòng đảm bảo bạn là chủ phòng và có dữ liệu.', 'error');
            return;
        }

        // Ensure the user is not anonymous if they want to save to their personal library
        if (!auth.currentUser || auth.currentUser.isAnonymous) {
            showToast('Vui lòng đăng nhập để lưu bài trắc nghiệm vào thư viện cá nhân của bạn.', 'warning');
            return;
        }

        loadingOverlay.classList.remove('hidden');
        showToast('Đang lưu bài trắc nghiệm vào thư viện...', 'info');

        const userId = auth.currentUser.uid;
        const userName = auth.currentUser.displayName || 'Ẩn danh';

        // Map questions to the final format, including the host-selected correct answer
        const finalQuestions = currentQuizData.questions.map(q => ({
            question: q.question,
            options: q.options,
            correctAnswerIndex: q.hostSelectedAnswerIndex // The host's selected answer becomes the correct one
        }));

        const quizToSave = {
            title: currentQuizData.quizTitle || 'Trắc nghiệm từ phòng học',
            description: `Bài trắc nghiệm được tạo và chọn đáp án bởi ${userName} trong phòng học.`, // Description for the saved quiz
            questions: finalQuestions,
            createdAt: new Date(),
            createdBy: userId,
            authorName: userName,
            isPublic: false // Default to private, can be changed in editor later
        };

        try {
            await addDoc(collection(db, 'quizzes'), quizToSave);
            showToast('Đã lưu bài trắc nghiệm vào thư viện!', 'success');

            // Clear the quiz session in the room after saving
            await updateDoc(doc(db, 'study_rooms', roomId, 'quizSession', 'current'), {
                questions: [], // Clear questions
                currentQuestionIndex: 0,
                hostId: null,
                hostName: null
            });
            // UI will be reset by the onSnapshot listener
        } catch (error) {
            console.error("Error saving quiz to library:", error);
            showToast('Lỗi khi lưu bài trắc nghiệm.', 'error');
        } finally {
            loadingOverlay.classList.add('hidden');
            // Reset local state after saving
            currentQuizData = null;
            currentQuestionIndex = 0;
            isHost = false;
            startQuizCollaborationBtn.disabled = true;
            quizFileInfo.classList.add('hidden');
            collaborativeQuizDisplay.classList.add('hidden');
            quizUploadArea.classList.remove('hidden');
        }
    });

    function main() {
        // Hiển thị loading ngay lập tức
        loadingOverlay.classList.remove('hidden');

        onAuthStateChanged(auth, (user) => {
            if (user) {
                // Nếu người dùng đã đăng nhập (bằng tài khoản hoặc ẩn danh), tiến hành tải phòng
                console.log("User is authenticated:", user.uid);
                resizeCanvas();
                initRoom(); // initRoom sẽ ẩn loading khi hoàn tất
            } else {
                // Nếu chưa có người dùng, thực hiện đăng nhập ẩn danh
                console.log("No user found, signing in anonymously...");
                signInAnonymously(auth)
                    .catch((error) => {
                        console.error("Anonymous sign-in failed:", error);
                        loadingOverlay.innerHTML = `<p class="text-red-500 text-center">Lỗi xác thực. Vui lòng tải lại trang.</p>`;
                        showToast('Lỗi xác thực. Không thể tải phòng học.', 'error');
                    });
                // onAuthStateChanged sẽ tự động được gọi lại sau khi đăng nhập thành công,
                // và luồng xử lý sẽ rơi vào điều kiện if (user) ở trên.
            }
        });
    }

    main();
});

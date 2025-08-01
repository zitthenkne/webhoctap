// File: app.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { doc, setDoc, collection, addDoc, query, where, getDocs, getDoc, orderBy, limit, deleteDoc, updateDoc, runTransaction } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { showToast } from './utils.js';
import { achievements, checkAndAwardAchievement } from './achievements.js';

// ... (Toàn bộ các hằng số const giữ nguyên như trước)
const menuToggleBtn = document.getElementById('menu-toggle-btn');
const sidebar = document.getElementById('sidebar');
const pageTitle = document.getElementById('pageTitle');
const userMenuButton = document.getElementById('user-menu-button');
const userName = document.getElementById('user-name');
const userAvatar = document.getElementById('user-avatar');
const userNameSidebar = document.getElementById('user-name-sidebar');
const userAvatarSidebar = document.getElementById('user-avatar-sidebar');
const userAvatarMobile = document.getElementById('user-avatar-mobile');
const authModal = document.getElementById('authModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const loginBtn = document.getElementById('loginBtn');
const signupBtn = document.getElementById('signupBtn');
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const fileNameElem = document.getElementById('fileName');
const processBtn = document.getElementById('processBtn');
const contentPanels = document.querySelectorAll('.content-panel');
const navLinks = document.querySelectorAll('.nav-link');
const saveBtnPreQuiz = document.getElementById('saveBtn-preQuiz');
const questionCountInfo = document.getElementById('question-count-info');
const selectCreateQuizBtn = document.getElementById('selectCreateQuiz');
const selectGpaCalculatorBtn = document.getElementById('selectGpaCalculator');
const selectStudyRoomBtn = document.getElementById('selectStudyRoom');
const calculateGpaBtn = document.getElementById('calculate-gpa-btn');
const gpaResultArea = document.getElementById('gpa-result-area');
const downloadTemplateBtn = document.getElementById('download-template-btn');

let questions = [];
let userQuizSets = []; // Biến cache để tìm kiếm phía client
let progressChartInstance = null; // Biến để giữ instance của biểu đồ

// ... (Các hàm từ onAuthStateChanged đến parseFile giữ nguyên)
function showContent(targetId, title = 'Dashboard') {
    contentPanels.forEach(panel => panel.classList.add('hidden'));
    navLinks.forEach(link => {
        link.classList.remove('bg-pink-100', 'font-bold');
    });
    const targetPanel = document.getElementById(targetId);
    if (targetPanel) {
        targetPanel.classList.remove('hidden');
    }
    const activeLink = document.querySelector(`.nav-link[data-target="${targetId}"]`);
    if (activeLink) {
        activeLink.classList.add('bg-pink-100', 'font-bold');
    }
    if (pageTitle) {
        pageTitle.textContent = title;
    }
    if (window.innerWidth < 768) {
        sidebar.classList.add('hidden');
    }
    if (targetId === 'libraryContent') {
        loadAndDisplayLibrary();
    }
    // CẬP NHẬT: Gọi hàm loadAndDisplayStats khi vào trang Thống kê
    if (targetId === 'statsContent') {
        loadAndDisplayStats();
    }
    if (targetId === 'myStudyRoomsContent') {
        loadAndDisplayMyStudyRooms();
    }
}

onAuthStateChanged(auth, user => {
    if (user) {
        const displayName = user.displayName || user.email.split('@')[0];
        const avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=FF69B4&color=fff`;
        if (userName) userName.textContent = displayName;
        if (userAvatar) {
    userAvatar.src = avatarUrl;
    userAvatar.style.cursor = 'pointer';
    userAvatar.onclick = () => window.location.href = 'profile.html';
}
        if (userNameSidebar) userNameSidebar.textContent = displayName;
        if (userAvatarSidebar) {
    userAvatarSidebar.src = avatarUrl;
    userAvatarSidebar.style.cursor = 'pointer';
    userAvatarSidebar.onclick = () => window.location.href = 'profile.html';
}
        if (userAvatarMobile) {
    userAvatarMobile.src = avatarUrl;
    userAvatarMobile.style.cursor = 'pointer';
    userAvatarMobile.onclick = () => window.location.href = 'profile.html';
}
        userMenuButton.onclick = handleLogout;
    } else {
        if (userName) userName.textContent = 'Khách';
        if (userAvatar) userAvatar.src = `https://ui-avatars.com/api/?name=?&background=D8BFD8&color=fff`;
        if (userNameSidebar) userNameSidebar.textContent = 'Khách';
        if (userAvatarSidebar) userAvatarSidebar.src = `https://ui-avatars.com/api/?name=?&background=D8BFD8&color=fff`;
        if (userAvatarMobile) userAvatarMobile.src = `https://ui-avatars.com/api/?name=?&background=D8BFD8&color=fff`;
        userMenuButton.onclick = toggleAuthModal;
    }
});
async function handleLogout() { if (confirm('Bạn có chắc muốn đăng xuất?')) { await signOut(auth); showToast('Đã đăng xuất!', 'info'); } }
function toggleAuthModal() { authModal.classList.toggle('hidden'); }
async function handleLogin() { const email = document.getElementById('emailInput').value; const password = document.getElementById('passwordInput').value; if (!email || !password) return showToast('Vui lòng nhập đủ thông tin.', 'warning'); try { await signInWithEmailAndPassword(auth, email, password); toggleAuthModal(); showToast('Đăng nhập thành công!', 'success'); } catch (error) { showToast('Đăng nhập thất bại: ' + error.message, 'error'); } }
async function handleSignup() { const email = document.getElementById('emailInput').value; const password = document.getElementById('passwordInput').value; if (!email || !password) return showToast('Vui lòng nhập đủ thông tin.', 'warning'); try { const userCredential = await createUserWithEmailAndPassword(auth, email, password); const user = userCredential.user; await setDoc(doc(db, "users", user.uid), { email: user.email, createdAt: new Date(), quizSetsCreated: 0 }); showToast('Đăng ký thành công!', 'success'); toggleAuthModal(); } catch (error) { showToast('Đăng ký thất bại: ' + error.message, 'error'); } }
async function handleFileSelect(e) { const file = e.target.files[0]; if (!file) return; fileNameElem.textContent = file.name; questionCountInfo.textContent = 'Đang phân tích...'; fileInfo.classList.remove('hidden'); processBtn.classList.add('hidden'); saveBtnPreQuiz.classList.add('hidden'); try { const parsedQuestions = await parseFile(file); if (parsedQuestions.length === 0) { questionCountInfo.textContent = 'Lỗi: Không tìm thấy câu hỏi.'; return; } const topics = parsedQuestions.map(q => q.topic); const uniqueTopics = new Set(topics); questions = parsedQuestions; currentQuizTitle = file.name.replace(/\.(xlsx|xls|csv)$/, ''); questionCountInfo.textContent = `✓ Tìm thấy ${questions.length} câu hỏi / ${uniqueTopics.size} chủ đề.`; processBtn.classList.remove('hidden'); saveBtnPreQuiz.classList.remove('hidden'); saveBtnPreQuiz.disabled = false; saveBtnPreQuiz.innerHTML = '<i class="fas fa-save mr-2"></i> Lưu vào thư viện'; } catch (error) { questionCountInfo.textContent = 'Lỗi! Không thể đọc file.'; console.error("Lỗi phân tích file:", error); } }
function parseFile(file) {
    // Các tên cột tương đương cho từng trường
    const COLUMN_ALIASES = {
        question: ['question', 'câu hỏi', 'nội dung câu hỏi', 'nội dung', 'nội dung đề bài', 'đề bài', 'câu hỏi kiểm tra', 'câu hỏi quiz', 'question content', 'question text', 'question body', 'đề kiểm tra', 'đề quiz', 'question title', 'question name'],
        option1: ['option1', 'phương án 1', 'đáp án 1', 'lựa chọn 1', 'a', 'answer1', 'option a', 'A', 'đáp án a', 'ĐÁP ÁN A', 'lựa chọn a', 'phương án a', 'đáp án thứ nhất', 'đáp án đầu tiên'],
        option2: ['option2', 'phương án 2', 'đáp án 2', 'lựa chọn 2', 'b', 'answer2', 'option b', 'B', 'đáp án b', 'ĐÁP ÁN B', 'lựa chọn b', 'phương án b', 'đáp án thứ hai'],
        option3: ['option3', 'phương án 3', 'đáp án 3', 'lựa chọn 3', 'c', 'answer3', 'option c', 'C', 'đáp án c', 'ĐÁP ÁN C', 'lựa chọn c', 'phương án c', 'đáp án thứ ba'],
        option4: ['option4', 'phương án 4', 'đáp án 4', 'lựa chọn 4', 'd', 'answer4', 'option d', 'D', 'đáp án d', 'ĐÁP ÁN D', 'lựa chọn d', 'phương án d', 'đáp án thứ tư'],
        correct: ['correct', 'đáp án đúng', 'đáp án', 'answer', 'đúng', 'correctanswer', 'đáp án số', 'correct answer', 'đáp án chính xác', 'đáp án chuẩn', 'đáp án trúng', 'đáp án được chọn', 'đáp án đúng nhất', 'đáp án xác nhận'],
        topic: ['topic', 'chủ đề', 'môn học', 'phân loại', 'subject', 'category', 'lĩnh vực', 'topic name', 'topic title', 'lĩnh vực kiến thức', 'lĩnh vực học tập', 'lĩnh vực chủ đề'],
        explanation: ['explanation', 'giải thích', 'lý giải', 'giải nghĩa', 'explain', 'giải thích đáp án', 'giải thích lý do', 'diễn giải', 'phân tích đáp án', 'phân tích', 'chi tiết đáp án'],
        source: ['source', 'nguồn', 'tài liệu', 'reference', 'nguon', 'nguồn tham khảo', 'nguồn gốc', 'nguồn đề', 'nguồn câu hỏi', 'tài liệu tham khảo'],
        level: ['level', 'mức độ', 'độ khó', 'difficulty', 'độ khó khăn', 'muc do', 'cấp độ', 'trình độ', 'bậc', 'độ phức tạp'],
        note: ['note', 'ghi chú', 'ghi chu', 'chú thích', 'comment', 'remark', 'lưu ý', 'nhận xét', 'bổ sung', 'chú giải', 'chú ý']
    };
    // Hàm tìm index cột theo alias
    function findColumnIdx(headers, aliases) {
        // So sánh tên cột đã chuẩn hóa (trim, toLowerCase)
        return headers.findIndex(h => {
            const norm = (h || '').toString().trim().toLowerCase();
            return aliases.some(alias => norm === alias.trim().toLowerCase());
        });
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                if (!jsonData || jsonData.length < 2) return resolve([]);
                const headers = jsonData[0].map(h => (h || '').toString().trim().toLowerCase());
                // Ánh xạ trường logic -> index cột
                const colIdx = {};
                for (const key in COLUMN_ALIASES) {
                    colIdx[key] = findColumnIdx(headers, COLUMN_ALIASES[key]);
                }
                const parsedQuestions = jsonData.slice(1).map(row => {
                    const questionIdx = colIdx['question'];
                    if (!row || questionIdx === undefined || !row[questionIdx] || String(row[questionIdx]).trim() === '') return null;
                    const option1Idx = colIdx['option1'];
                    const option2Idx = colIdx['option2'];
                    const option3Idx = colIdx['option3'];
                    const option4Idx = colIdx['option4'];
                    const correctIdx = colIdx['correct'];
                    const topicIdx = colIdx['topic'];
                    const explanationIdx = colIdx['explanation'];
                    let correctAnswerIndex = null;
                    if (correctIdx !== undefined && row[correctIdx] != null) {
                        let val = row[correctIdx].toString().trim();
                        // Nếu là số 1-4
                        if (/^[1-4]$/.test(val)) {
                            correctAnswerIndex = parseInt(val, 10) - 1;
                        } else if (/^[a-dA-D]$/.test(val)) {
                            // Nếu là A/B/C/D (không phân biệt hoa thường)
                            correctAnswerIndex = val.toUpperCase().charCodeAt(0) - 65; // 'A'->0, 'B'->1, ...
                        }
                    }
                    const sourceIdx = colIdx['source'];
                    const levelIdx = colIdx['level'];
                    const noteIdx = colIdx['note'];
                    return {
                        question: row[questionIdx],
                        answers: [option1Idx, option2Idx, option3Idx, option4Idx]
                            .map(idx => idx !== undefined ? row[idx] : undefined)
                            .filter(ans => ans != null && String(ans).trim() !== ''),
                        correctAnswerIndex: correctAnswerIndex,
                        explanation: explanationIdx !== undefined ? (row[explanationIdx] || '') : '',
                        topic: topicIdx !== undefined ? (row[topicIdx] || 'Chung') : 'Chung',
                        source: sourceIdx !== undefined ? (row[sourceIdx] || '') : '',
                        level: levelIdx !== undefined ? (row[levelIdx] || '') : '',
                        note: noteIdx !== undefined ? (row[noteIdx] || '') : ''
                    };
                }).filter(q => q !== null);
                resolve(parsedQuestions);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}
let currentQuizTitle = ''; // Biến này cần được khai báo ở đây

// Hàm lưu và bắt đầu bài kiểm tra (quay lại như cũ)
async function saveAndStartQuiz() {
    const user = auth.currentUser;
    if (!user) {
        showToast('Vui lòng đăng nhập để lưu bộ đề.', 'info');
        toggleAuthModal();
        return;
    }
    if (questions.length === 0) return showToast('Không có câu hỏi để bắt đầu.', 'warning');
    processBtn.disabled = true;
    processBtn.innerHTML = 'Đang chuẩn bị...';

    try {
        const docRef = await addDoc(collection(db, "quiz_sets"), {
            userId: user.uid,
            title: currentQuizTitle,
            questionCount: questions.length,
            questions: questions,
            createdAt: new Date(),
            isPublic: true // Luôn public bộ đề
        });
        await checkCreationAchievements(user.uid);
        window.location.href = `quiz.html?id=${docRef.id}`;
    } catch (e) {
        showToast('Lỗi khi lưu bộ đề: ' + e.message, 'error');
        processBtn.disabled = false;
        processBtn.innerHTML = '<i class="fas fa-play-circle mr-2"></i> Bắt đầu';
        console.error("Lỗi:", e);
    }
}

// Hàm chỉ lưu (quay lại như cũ)
async function saveOnly() {
    const user = auth.currentUser;
    if (!user) {
        showToast('Vui lòng đăng nhập để lưu bộ đề.', 'info');
        toggleAuthModal();
        return;
    }
    if (questions.length === 0) return showToast('Không có câu hỏi để lưu.', 'warning');
    saveBtnPreQuiz.disabled = true;
    saveBtnPreQuiz.innerHTML = 'Đang lưu...';

    try {
        await addDoc(collection(db, "quiz_sets"), {
            userId: user.uid,
            title: currentQuizTitle,
            questionCount: questions.length,
            questions: questions,
            createdAt: new Date(),
            isPublic: true // Luôn public bộ đề
        });
        await checkCreationAchievements(user.uid);
        showToast(`Đã lưu "${currentQuizTitle}" vào thư viện!`, 'success');
        saveBtnPreQuiz.innerHTML = '✓ Đã lưu';
    } catch (e) {
        saveBtnPreQuiz.disabled = false;
        saveBtnPreQuiz.innerHTML = 'Lưu';
        showToast('Lỗi khi lưu: ' + e.message, 'error');
        console.error("Lỗi:", e);
    }
}

// Hàm kiểm tra các thành tựu liên quan đến việc tạo bộ đề
async function checkCreationAchievements(userId) {
    const userRef = doc(db, "users", userId);
    try {
        await runTransaction(db, async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists()) {
                throw "Tài liệu người dùng không tồn tại!";
            }
            const newCount = (userDoc.data().quizSetsCreated || 0) + 1;
            transaction.update(userRef, { quizSetsCreated: newCount });

            // Kiểm tra thành tựu dựa trên số lượng mới
            if (newCount === 5) {
                checkAndAwardAchievement(userId, 'COLLECTOR');
            }
        });
    } catch (e) {
        console.error("Lỗi giao dịch khi kiểm tra thành tựu: ", e);
    }
}

// XỬ LÝ TÌM KIẾM TRONG THƯ VIỆN
const librarySearchInput = document.getElementById('library-search-input');
if (librarySearchInput) {
function filterLibraryByMode(keyword, mode) {
    if (!keyword) return userQuizSets;
    if (typeof Fuse === 'undefined') return userQuizSets; // fallback nếu Fuse chưa tải
    keyword = keyword.toLowerCase();
    if (mode === 'quiz') {
        // Tìm kiếm fuzzy trong tiêu đề và mô tả
        const fuse = new Fuse(userQuizSets, {
            keys: ['title', 'description'],
            threshold: 0.4,
            ignoreLocation: true,
            minMatchCharLength: 2,
        });
        return fuse.search(keyword).map(res => res.item);
    } else if (mode === 'question') {
        // Gom tất cả câu hỏi thành 1 mảng lớn, mỗi câu hỏi biết bộ đề cha
        let allQuestions = [];
        userQuizSets.forEach(qz => {
            if (Array.isArray(qz.questions)) {
                qz.questions.forEach(q => {
                    allQuestions.push({
                        quizTitle: qz.title || 'Không tên',
                        question: q.question,
                        options: q.options || []
                    });
                });
            }
        });
        const fuse = new Fuse(allQuestions, {
            keys: ['question'],
            threshold: 0.4,
            ignoreLocation: true,
            minMatchCharLength: 2,
        });
        return fuse.search(keyword).map(res => res.item);
    }
    return userQuizSets;
}

function highlightKeyword(text, keyword) {
    if (!keyword) return text;
    // Escape RegExp special chars in keyword
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Fuzzy: highlight từng từ trong keyword nếu có nhiều từ
    const words = escaped.split(/\s+/).filter(Boolean);
    if (!words.length) return text;
    const re = new RegExp(`(${words.join('|')})`, 'gi');
    return text.replace(re, '<mark class="bg-yellow-200">$1</mark>');
}

function renderQuestionSearchResults(results) {
    const container = document.getElementById('quiz-list-container');
    if (!container) return;
    const keyword = librarySearchInput.value.trim();
    if (!results.length) {
        container.innerHTML = '<div class="text-gray-400 text-center col-span-full">Không tìm thấy câu hỏi nào phù hợp.</div>';
        return;
    }
    container.innerHTML = results.map(item => `
        <div class="bg-white rounded-xl shadow p-4 border border-pink-100 flex flex-col gap-2">
            <div class="text-pink-600 font-semibold text-base mb-1"><i class="fas fa-book mr-1"></i>${highlightKeyword(item.quizTitle, keyword)}</div>
            <div class="font-bold text-gray-800 mb-2">${highlightKeyword(item.question, keyword)}</div>
            ${item.options && item.options.length ? `<ul class="list-disc ml-5 text-gray-700 mb-2">${item.options.map(opt => `<li>${highlightKeyword(opt, keyword)}</li>`).join('')}</ul>` : ''}
        </div>
    `).join('');
}

function handleLibrarySearch() {
    const keyword = librarySearchInput.value.trim();
    const mode = document.querySelector('input[name="search-mode"]:checked')?.value || 'quiz';
    if (mode === 'quiz') {
        const filtered = filterLibraryByMode(keyword, 'quiz');
        renderLibrary(filtered);
    } else {
        // Tìm tất cả câu hỏi khớp từ khóa
        let results = [];
        if (keyword) {
            userQuizSets.forEach(qz => {
                if (Array.isArray(qz.questions)) {
                    qz.questions.forEach(q => {
                        if ((q.question || '').toLowerCase().includes(keyword.toLowerCase())) {
                            results.push({
                                quizTitle: qz.title || 'Không tên',
                                question: q.question,
                                options: q.options || []
                            });
                        }
                    });
                }
            });
        }
        renderQuestionSearchResults(results);
    }
}

librarySearchInput.addEventListener('input', handleLibrarySearch);
const searchModeQuiz = document.getElementById('search-mode-quiz');
const searchModeQuestion = document.getElementById('search-mode-question');
if (searchModeQuiz && searchModeQuestion) {
    searchModeQuiz.addEventListener('change', handleLibrarySearch);
    searchModeQuestion.addEventListener('change', handleLibrarySearch);
}
}
async function loadAndDisplayLibrary() {
    const user = auth.currentUser;
    const quizListContainer = document.getElementById('quiz-list-container');
    quizListContainer.innerHTML = `<div class="text-gray-500">Đang tải...</div>`;

    if (!user) {
        quizListContainer.innerHTML = '<p>Vui lòng <a href="#" id="login-link" class="text-[#FF69B4] underline">đăng nhập</a>.</p>';
        document.getElementById('login-link').onclick = (e) => { e.preventDefault(); toggleAuthModal(); };
        return;
    }

    try {
        const q = query(collection(db, "quiz_sets"), where("userId", "==", user.uid), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);

        userQuizSets = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); // Giữ lại biến cache nhưng không dùng cho tìm kiếm
        
        renderLibrary(userQuizSets);

    } catch (e) {
        console.error("Lỗi tải thư viện: ", e);
        quizListContainer.innerHTML = '<p class="text-red-500">Lỗi tải thư viện.</p>';
    }
}

function renderLibrary(quizzesToDisplay) {
    const quizListContainer = document.getElementById('quiz-list-container');
    quizListContainer.innerHTML = '';

    if (quizzesToDisplay.length === 0) {
        quizListContainer.innerHTML = '<p class="text-gray-500">Không tìm thấy bộ đề nào khớp.</p>';
        return;
    }

    quizzesToDisplay.forEach((quizSet) => {
        const card = document.createElement('div');
        card.className = 'bg-white rounded-lg shadow-md p-4 flex flex-col';
        card.innerHTML = `
            <div class="flex-grow relative">
                <h3 class="text-md font-bold text-gray-700">${quizSet.title}</h3>
                <p class="text-sm text-gray-500 mt-2">${quizSet.questionCount} câu hỏi</p>
                <p class="text-xs text-gray-400 mt-1">Lưu ngày: ${new Date(quizSet.createdAt.toDate()).toLocaleDateString()}</p>
                <button class="quiz-menu-btn absolute top-2 right-2 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-pink-500 focus:outline-none" data-id="${quizSet.id}" title="Tuỳ chọn"><i class="fas fa-ellipsis-h"></i></button>
                <div class="quiz-menu hidden absolute top-10 right-2 bg-white rounded-lg shadow-lg border border-pink-100 z-20 min-w-[160px]">
                    <button class="block w-full text-left px-4 py-2 text-gray-700 hover:bg-pink-50 quiz-history-btn" data-id="${quizSet.id}"><i class="fas fa-history mr-2 text-pink-400"></i>Xem lịch sử làm bài</button>
                    <button class="block w-full text-left px-4 py-2 text-blue-700 hover:bg-pink-50 edit-quiz-content-btn" data-id="${quizSet.id}"><i class="fas fa-pen-alt mr-2 text-blue-400"></i>Sửa câu hỏi</button>
                    <button class="block w-full text-left px-4 py-2 text-gray-700 hover:bg-pink-50 edit-quiz-btn" data-id="${quizSet.id}" data-title="${quizSet.title}"><i class="fas fa-edit mr-2 text-blue-400"></i>Sửa tên</button>
                    <button class="block w-full text-left px-4 py-2 text-green-700 hover:bg-pink-50 share-quiz-btn" data-id="${quizSet.id}"><i class="fas fa-share-alt mr-2 text-green-400"></i>Chia sẻ</button>
                    <button class="block w-full text-left px-4 py-2 text-red-700 hover:bg-pink-50 delete-quiz-btn" data-id="${quizSet.id}"><i class="fas fa-trash-alt mr-2 text-red-400"></i>Xóa</button>
                </div>
            </div>
            <div class="mt-4 flex flex-col gap-2">
                <a href="quiz.html?id=${quizSet.id}" class="w-full text-center px-4 py-3 bg-[#FF69B4] text-white rounded-lg hover:bg-opacity-80 transition text-lg font-bold">Bắt đầu</a>
            </div>
        `;
        quizListContainer.appendChild(card);
        // Thêm event cho nút chia sẻ
        setTimeout(() => { // Đảm bảo DOM đã render
            const shareBtn = card.querySelector('.share-quiz-btn');
            if (shareBtn) {
                shareBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const quizId = this.getAttribute('data-id');
                    const url = `${window.location.origin}/quiz.html?id=${quizId}`;
                    if (navigator.share) {
                        navigator.share({
                            title: 'Chia sẻ bộ đề',
                            url: url
                        }).catch(()=>{});
                    } else if (navigator.clipboard) {
                        navigator.clipboard.writeText(url);
                        if (typeof showToast === 'function') showToast('Đã copy link bộ đề!', 'success');
                        else alert('Đã copy link bộ đề: ' + url);
                    } else {
                        alert('Link bộ đề: ' + url);
                    }
                });
            }
        }, 0);
    });
}

// CẬP NHẬT: Cải thiện hàm xóa với try-catch
async function deleteQuizSet(quizId) {
    if (confirm("Bạn có chắc muốn xóa bộ đề này? Hành động này không thể hoàn tác.")) {
        try {
            await deleteDoc(doc(db, "quiz_sets", quizId));
            showToast("Đã xóa bộ đề thành công!", 'success');
            loadAndDisplayLibrary(); // Tải lại thư viện để cập nhật giao diện
        } catch (e) {
            showToast("Xóa thất bại! Lỗi: " + e.message, 'error');
            console.error("Lỗi khi xóa bộ đề: ", e);
        }
    }
}

// Hàm sửa tên bộ đề (quay lại như cũ)
async function editQuizSetTitle(quizId, currentTitle) {
    const newTitle = prompt("Nhập tên mới cho bộ đề:", currentTitle);
    if (newTitle && newTitle.trim() !== '') {
        const docRef = doc(db, "quiz_sets", quizId);
        await updateDoc(docRef, { title: newTitle.trim() });
        showToast('Đã cập nhật tên bộ đề!', 'success');
        loadAndDisplayLibrary();
    }
}

function downloadTemplate() { const sampleData = [
  [
    '★ Nội dung câu hỏi', // BẮT BUỘC - hoặc: question, câu hỏi, nội dung câu hỏi
    '★ Đáp án 1', // BẮT BUỘC - hoặc: option1, A, phương án 1
    '★ Đáp án 2', // BẮT BUỘC
    'Đáp án 3',
    'Đáp án 4',
    '★ Đáp án đúng (1,2,3,4 hoặc A,B,C,D)', // BẮT BUỘC - hoặc: correct, đáp án đúng
    'Chủ đề', // hoặc: topic, chủ đề
    'Giải thích', // hoặc: explanation, giải thích
    'Nguồn (Source)', // hoặc: source, nguồn, tài liệu
    'Mức độ (Level)', // hoặc: level, mức độ, độ khó
    'Ghi chú (Note)' // hoặc: note, ghi chú, comment
  ],
  [
    'Lưu ý: Các cột có dấu ★ là bắt buộc phải nhập. Các cột còn lại có thể bỏ trống.', '', '', '', '', '', '', '', '', '', ''
  ],
  [
    'Thủ đô của Việt Nam là gì?',
    'TP. Hồ Chí Minh',
    'Đà Nẵng',
    'Hà Nội',
    'Hải Phòng',
    '3', // hoặc 'C'
    'Địa lý',
    'Hà Nội là thủ đô của nước CHXHCN Việt Nam.',
    'SGK Địa lý 4',
    'Nhận biết',
    'Câu hỏi cơ bản'
  ],
  [
    'Vitamin nào tan trong nước?',
    'A',
    'B',
    'D',
    'K',
    '2', // hoặc 'B'
    'Sinh học',
    'Vitamin nhóm B tan trong nước, A/D/K tan trong dầu.',
    'Sách Sinh học nâng cao',
    'Vận dụng',
    'Có thể gây nhầm lẫn cho học sinh'
  ]
];
const worksheet = XLSX.utils.aoa_to_sheet(sampleData);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, "Zitthenkne Mau");
worksheet['!cols'] = [
  {wch: 50}, {wch: 25}, {wch: 25}, {wch: 25}, {wch: 25},
  {wch: 30}, {wch: 25}, {wch: 50}, {wch: 30}, {wch: 20}, {wch: 30}
];
XLSX.writeFile(workbook, "File mẫu nè.xlsx");
}
// HÀM calculateGPA - PHIÊN BẢN HOÀN CHỈNH
// HÀM calculateGPA - PHIÊN BẢN CẬP NHẬT THEO CÔNG THỨC MỚI
function calculateGPA() {
    const correctAnswersInput = document.getElementById('correct-answers');
    const totalQuestionsInput = document.getElementById('total-questions');
    const resultArea = document.getElementById('gpa-result-area');
    const score10Text = document.getElementById('gpa-score10-text');
    const score4Text = document.getElementById('gpa-score4-text');
    const letterGradeText = document.getElementById('gpa-letter-grade');
    const motivationText = document.getElementById('gpa-motivation-text');
    const squirrelImg = document.getElementById('gpa-squirrel-img');

    const x = parseInt(correctAnswersInput.value, 10); // Số câu đúng
    const y = parseInt(totalQuestionsInput.value, 10); // Tổng số câu

    if (isNaN(x) || isNaN(y) || y <= 0 || x < 0 || x > y) {
        showToast('Vui lòng nhập số câu hợp lệ!', 'warning');
        return;
    }

    const n = x / y;
    let score10;

    // ----- BƯỚC 1: TÍNH ĐIỂM HỆ 10 THEO CÔNG THỨC 5 TRƯỜNG HỢP -----
    if (n < 0.5) {
        score10 = (8 * x) / y;
    } else if (n === 0.5) {
        score10 = 4.0;
    } else if (n > 0.5 && n < 0.6) {
        score10 = 4 + (10 * (x - 0.5 * y)) / y;
    } else if (n === 0.6) {
        score10 = 5.0;
    } else { // n > 0.6
        score10 = 5 + (12.5 * (x - 0.6 * y)) / y;
    }

    let score4, letterGrade, motivation, img;

    // ----- BƯỚC 2: QUY ĐỔI SANG ĐIỂM HỆ 4 VÀ ĐIỂM CHỮ THEO BẢNG -----
     if (score10 >= 9.5) {
        score4 = 4.0;
        letterGrade = 'A+';
        img = 'assets/squirrel_A.png';
        motivation = "Ối dồi ôi, ối dồi ôi, trình là j mà là trình ai chấm!!! Anh chỉ biết làm ba mẹ anh tự hào, xây căn nhà thật to ở 1 mình 2 tấm";
    } else if (score10 >= 8.5) {
        score4 = 4.0;
        letterGrade = 'A';
        img = 'assets/squirrel_A.png';
        motivation = "Dỏi dữ dị bà, trộm día trộm díaaaaaa, xin vía 4.0 <3";
    } else if (score10 >= 8.0) {
        score4 = 3.5;
        letterGrade = 'B+';
        img = 'assets/squirrel_B.png';
        motivation = "gút chóp bây bề";
    } else if (score10 >= 7.0) {
        score4 = 3.0;
        letterGrade = 'B';
        img = 'assets/squirrel_B.png';
        motivation = "Quaooooooo, vá là dỏi òiiiiii";
    } else if (score10 >= 6.5) {
        score4 = 2.5;
        letterGrade = 'C+';
        img = 'assets/squirrel_C.png';
        motivation = "Điểm này là cũng cũng ròi á mom, u so gud babi";
    } else if (score10 >= 5.5) {
        score4 = 2.0;
        letterGrade = 'C';
        img = 'assets/squirrel_C.png';
        motivation = "Cũn cũn ik, cố gắng lên nhennn";
    } else if (score10 >= 5.0) {
        score4 = 1.5;
        letterGrade = 'D+';
        img = 'assets/squirrel_D.png';
        motivation = "Vừa đủ qua. Cần xem lại kiến thức một chút.";
    } else if (score10 >= 4.0) {
        score4 = 1.0;
        letterGrade = 'D';
        img = 'assets/squirrel_D.png';
        motivation = "Qua môn rồi! Chúc mừng nha bàaaaa";
    } else { // Dưới 4.0
        score4 = 0.0;
        letterGrade = 'F';
        img = 'assets/squirrel_F.png';
        motivation = "Hoi mò hoi mò, lần sau sẽ tốt hơn mà!";
    }


    // Hiển thị kết quả
    score10Text.textContent = score10.toFixed(2);
    score4Text.textContent = score4.toFixed(1);
    letterGradeText.textContent = letterGrade;
    motivationText.textContent = motivation;
    squirrelImg.src = img;
    
    resultArea.classList.remove('hidden');
}

// HÀM MỚI: Tải và hiển thị toàn bộ trang thống kê
// HÀM loadAndDisplayStats ĐÃ ĐƯỢC NÂNG CẤP HOÀN CHỈNH
async function loadAndDisplayStats() {
    const user = auth.currentUser;
    const achievementsContainer = document.getElementById('achievements-container');
    const statsContainer = document.getElementById('stats-container');
    const progressChartCanvas = document.getElementById('progressChart');
    
    // Reset giao diện
    achievementsContainer.innerHTML = '';
    statsContainer.innerHTML = '<h3 class="text-lg font-semibold p-6 text-gray-700">Lịch sử chi tiết</h3>';

    if (!user) {
        achievementsContainer.innerHTML = '<p class="text-gray-500 col-span-full text-center">Vui lòng đăng nhập để xem thành tựu.</p>';
        statsContainer.innerHTML += '<p class="text-gray-500 px-6 pb-6 text-center">Vui lòng đăng nhập để xem lịch sử.</p>';
        return;
    }

    try {
        // CẬP NHẬT: Sử dụng đối tượng achievements đã được import
        // Lấy danh sách tất cả các thành tựu có thể có
        const allAchievements = Object.values(achievements);
        
        // Tạo các placeholder cho thành tựu
        allAchievements.forEach(ach => {
            const achievementEl = document.createElement('div');
            achievementEl.className = 'flex flex-col items-center gap-2 opacity-50 grayscale'; // Mặc định mờ và xám
            achievementEl.id = `achievement-${ach.name.replace(/\s/g, '-')}`; // Đặt ID để dễ cập nhật
            achievementEl.innerHTML = `
                <div class="bg-white p-2 rounded-lg shadow-md">
                    <img src="${ach.img}" alt="${ach.name}" class="w-24 h-24 object-cover rounded-md">
                </div>
                <p class="font-semibold text-sm text-gray-700 mt-1">${ach.name}</p>
            `;
            achievementsContainer.appendChild(achievementEl);
        });

        // Tải thành tựu người dùng đã mở khóa
        const achievementsQuery = query(collection(db, "users", user.uid, "achievements"));
        const achievementsSnapshot = await getDocs(achievementsQuery);
        
        // Hiển thị thành tựu
        if (achievementsSnapshot.empty) {
            achievementsContainer.innerHTML = '<p class="text-gray-500 col-span-full">Chưa có thành tựu nào được mở khóa.</p>';
        } else {
            achievementsSnapshot.forEach(doc => {
                const unlockedAchievement = achievements[doc.id]; // Lấy từ đối tượng achievements chung
                if (unlockedAchievement) {
                    const targetEl = document.getElementById(`achievement-${unlockedAchievement.name.replace(/\s/g, '-')}`);
                    if (targetEl) {
                        targetEl.classList.remove('opacity-50', 'grayscale'); // Bỏ mờ và xám
                        targetEl.classList.add('fade-in'); // Thêm hiệu ứng fade-in
                    }
                }
            });
        }
        
        // Tải và hiển thị lịch sử làm bài (giữ nguyên như cũ)
        const resultsQuery = query(collection(db, "quiz_results"), where("userId", "==", user.uid), orderBy("completedAt", "asc"));
        const resultsSnapshot = await getDocs(resultsQuery);
        const results = resultsSnapshot.docs.map(doc => doc.data());

        if (results.length === 0) {
            statsContainer.innerHTML += '<p class="text-gray-500 px-6 pb-6">Bạn chưa hoàn thành bài test nào.</p>';
            if(progressChartInstance) progressChartInstance.destroy();
        } else {
            results.forEach(result => {
                const resultEl = document.createElement('div');
                resultEl.className = 'px-6 py-4 border-t border-gray-200 flex justify-between items-center';
                resultEl.innerHTML = `
                    <div>
                        <p class="font-semibold text-gray-800">${result.quizTitle}</p>
                        <p class="text-sm text-gray-500">${new Date(result.completedAt.toDate()).toLocaleString()}</p>
                    </div>
                    <div class="text-right">
                        <p class="font-bold text-lg text-[#FF69B4]">${result.percentage}%</p>
                        <p class="text-sm text-gray-600">${result.score}/${result.totalQuestions} câu</p>
                    </div>
                `;
                statsContainer.appendChild(resultEl);
            });

            const chartLabels = results.map((r, index) => `Lần ${index + 1}`);
            const chartData = results.map(r => r.percentage);
            
            if(progressChartInstance) {
                progressChartInstance.destroy();
            }
            progressChartInstance = new Chart(progressChartCanvas, {
                type: 'line',
                data: {
                    labels: chartLabels,
                    datasets: [{
                        label: 'Tiến độ (%)',
                        data: chartData,
                        fill: true,
                        borderColor: '#FF69B4',
                        backgroundColor: 'rgba(255, 105, 180, 0.1)',
                        tension: 0.1
                    }]
                },
                options: {
                    responsive: true,
                    scales: { y: { beginAtZero: true, max: 100 } }
                }
            });
        }

    } catch (e) {
        console.error("Lỗi tải trang thống kê: ", e);
        achievementsContainer.innerHTML = '<p class="text-red-500 col-span-full">Lỗi tải thành tựu.</p>';
        statsContainer.innerHTML = '<p class="text-red-500 p-6">Lỗi tải lịch sử làm bài.</p>';
    }
}

// NEW: Function to load and display user's study rooms
async function loadAndDisplayMyStudyRooms() {
    const user = auth.currentUser;
    const myStudyRoomsListContainer = document.getElementById('my-study-rooms-list');
    myStudyRoomsListContainer.innerHTML = `<div class="text-gray-500 text-center">Đang tải phòng học của bạn...</div>`;

    if (!user) {
        myStudyRoomsListContainer.innerHTML = '<p class="text-center text-gray-500">Vui lòng <a href="#" id="login-link-study-room" class="text-[#FF69B4] underline">đăng nhập</a> để xem các phòng học của bạn.</p>';
        document.getElementById('login-link-study-room').onclick = (e) => { e.preventDefault(); toggleAuthModal(); };
        return;
    }

    try {
        const q = query(collection(db, "study_rooms"), where("owner", "==", user.uid), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            myStudyRoomsListContainer.innerHTML = '<p class="text-gray-500 text-center col-span-full">Bạn chưa tạo phòng học nào. Hãy tạo một phòng mới!</p>';
            return;
        }

        myStudyRoomsListContainer.innerHTML = ''; // Clear loading message
        querySnapshot.forEach((docSnap) => {
            const roomData = docSnap.data();
            const roomId = docSnap.id;
            const card = document.createElement('div');
            card.className = 'bg-white rounded-lg shadow-md p-4 flex flex-col';
            card.innerHTML = `
                <div class="flex-grow">
                    <h3 class="text-lg font-bold text-gray-700 truncate" title="${roomId}">Phòng: ${roomId.substring(0, 8)}...</h3>
                    <p class="text-sm text-gray-500 mt-2">Tạo lúc: ${roomData.createdAt ? new Date(roomData.createdAt.toDate()).toLocaleString() : 'N/A'}</p>
                </div>
                <div class="mt-4 flex flex-col gap-2">
                    <a href="study-room.html?id=${roomId}" class="w-full text-center px-4 py-2 bg-[#FF69B4] text-white rounded-lg hover:bg-opacity-80 transition text-sm">Vào phòng</a>
                    <button data-id="${roomId}" class="delete-study-room-btn w-full text-center px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition text-xs">Xóa phòng</button>
                </div>
            `;
            myStudyRoomsListContainer.appendChild(card);
        });
    } catch (e) {
        console.error("Lỗi tải phòng học của người dùng: ", e);
        myStudyRoomsListContainer.innerHTML = '<p class="text-red-500 text-center">Lỗi tải phòng học của bạn.</p>';
    }
}

// NEW: Function to delete a study room and its subcollection
async function deleteStudyRoom(roomIdToDelete) {
    if (!confirm(`Bạn có chắc muốn xóa phòng học "${roomIdToDelete}"? Hành động này sẽ xóa tất cả dữ liệu trong phòng và không thể hoàn tác.`)) {
        return;
    }
    try {
        const drawingsRef = collection(db, 'study_rooms', roomIdToDelete, 'drawings');
        const drawingsSnapshot = await getDocs(drawingsRef);
        const deletePromises = drawingsSnapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
        await deleteDoc(doc(db, "study_rooms", roomIdToDelete));
        showToast("Đã xóa phòng học thành công!", 'success');
        loadAndDisplayMyStudyRooms(); // Refresh the list
    } catch (e) {
        showToast("Xóa phòng học thất bại! Lỗi: " + e.message, 'error');
        console.error("Lỗi khi xóa phòng học: ", e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Auto switch tab if hash is present (e.g. #libraryContent)
    const hash = window.location.hash.replace('#', '');
    if (hash) {
        const navLink = document.querySelector(`.nav-link[data-target="${hash}"]`);
        if (navLink) navLink.click();
    }
});

function setupEventListeners() {
    if (closeModalBtn) closeModalBtn.addEventListener('click', toggleAuthModal);
    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
    if (signupBtn) signupBtn.addEventListener('click', handleSignup);
    if (uploadArea) uploadArea.addEventListener('click', () => fileInput.click());
    if (fileInput) fileInput.addEventListener('change', handleFileSelect);
    if (processBtn) processBtn.addEventListener('click', saveAndStartQuiz);
    if (saveBtnPreQuiz) saveBtnPreQuiz.addEventListener('click', saveOnly);
    if (menuToggleBtn) menuToggleBtn.addEventListener('click', () => sidebar.classList.toggle('hidden'));
    if (selectCreateQuizBtn) selectCreateQuizBtn.addEventListener('click', () => showContent('createQuizContent', 'Tạo trắc nghiệm'));
    
    // Correctly handle the "Đánh đề" button click
    if (selectStudyRoomBtn) selectStudyRoomBtn.addEventListener('click', (event) => {
        event.preventDefault(); // Prevent the default <a> tag behavior
        showContent('myStudyRoomsContent', 'Phòng học của tôi');
    });
    if (selectGpaCalculatorBtn) selectGpaCalculatorBtn.addEventListener('click', () => showContent('gpaCalculatorContent', 'Tính điểm hệ 4'));
    if (calculateGpaBtn) calculateGpaBtn.addEventListener('click', calculateGPA);
    if (downloadTemplateBtn) downloadTemplateBtn.addEventListener('click', downloadTemplate);
    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            const targetId = link.getAttribute('data-target');
            // Chỉ xử lý như SPA nếu có data-target
            if (targetId) {
                event.preventDefault();
                const title = link.querySelector('span').textContent;
                showContent(targetId, title);
            }
            // Nếu không có data-target, để trình duyệt tự điều hướng qua href
        });
    });

    // Use event delegation for buttons inside the dynamic content panels
    document.body.addEventListener('click', (event) => {
        // Button to create a new study room from the "My Rooms" panel
        if (event.target.id === 'create-new-study-room-btn') {
            // Hiện modal nhập ID phòng mới
            let modal = document.getElementById('createRoomIdModal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'createRoomIdModal';
                modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 px-2';
                modal.innerHTML = `
                    <div class="bg-white rounded-2xl shadow-2xl p-4 sm:p-8 w-full max-w-md relative">
                        <button type="button" id="closeCreateRoomIdModalBtn" class="absolute top-4 right-4 text-gray-400 hover:text-gray-700"><i class="fas fa-times text-2xl"></i></button>
                        <h2 class="text-2xl font-bold text-center mb-6 text-[#FF69B4]">Tạo phòng học mới</h2>
                        <input type="text" id="createRoomIdInput" placeholder="Nhập mã phòng (chỉ chữ/số, không dấu cách)" class="w-full px-4 py-2 border border-pink-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FF69B4] mb-4 transition-all duration-200">
                        <button type="button" id="saveCreateRoomIdBtn" class="w-full px-6 py-2 bg-[#FF69B4] text-white rounded-lg hover:bg-opacity-80 transition">Tạo phòng</button>
                    </div>
                `;
                document.body.appendChild(modal);
            }
            modal.classList.remove('hidden');
            document.getElementById('createRoomIdInput').value = '';
            document.getElementById('createRoomIdInput').focus();
            document.getElementById('closeCreateRoomIdModalBtn').onclick = () => modal.classList.add('hidden');
            document.getElementById('saveCreateRoomIdBtn').onclick = async () => {
                const user = auth.currentUser;
                const newId = document.getElementById('createRoomIdInput').value.trim();
                if (!user) {
                    showToast('Vui lòng đăng nhập để tạo phòng!', 'warning');
                    toggleAuthModal();
                    return;
                }
                if (!newId || !/^[a-zA-Z0-9_-]+$/.test(newId)) {
                    document.getElementById('createRoomIdInput').classList.add('border-red-400');
                    return;
                }
                // Kiểm tra trùng ID
                const checkDoc = await getDoc(doc(db, 'study_rooms', newId));
                if (checkDoc.exists()) {
                    showToast('ID phòng đã tồn tại, hãy chọn ID khác!', 'error');
                    document.getElementById('createRoomIdInput').classList.add('border-red-400');
                    return;
                }
                // Tạo phòng mới với ID này
                const { serverTimestamp } = await import('https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js');
                await setDoc(doc(db, 'study_rooms', newId), {
                    owner: user.uid,
                    createdAt: serverTimestamp(),
                    background: null
                });
                modal.classList.add('hidden');
                window.location.href = `study-room.html?id=${newId}`;
            };
            document.getElementById('createRoomIdInput').oninput = function() {
                this.classList.remove('border-red-400');
            };
            return;
        }
        // Delete button for a specific study room
        if (event.target.classList.contains('delete-study-room-btn')) {
            const roomIdToDelete = event.target.dataset.id;
            deleteStudyRoom(roomIdToDelete);
        }
    });

    const libraryContainer = document.getElementById('libraryContent');
    if (libraryContainer) {
        libraryContainer.addEventListener('click', (event) => {
            const target = event.target.closest('button');
            if (!target) return;
            const quizId = target.getAttribute('data-id');
            
            if (target.classList.contains('edit-quiz-btn')) {
                const currentTitle = target.getAttribute('data-title');
                editQuizSetTitle(quizId, currentTitle);
            } else if (target.classList.contains('delete-quiz-btn')) {
                deleteQuizSet(quizId);
            }
        });
    }
    const refreshLibraryBtn = document.getElementById('refresh-library-btn');
    if(refreshLibraryBtn) refreshLibraryBtn.addEventListener('click', loadAndDisplayLibrary);
    
    // CẬP NHẬT: Gán sự kiện cho nút refresh của trang thống kê
    const refreshStatsBtn = document.getElementById('refresh-stats-btn');
    if (refreshStatsBtn) refreshStatsBtn.addEventListener('click', loadAndDisplayStats);
}

// === KHỞI CHẠY ỨNG DỤNG ===
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    showContent('dashboardContent', 'Trang chủ');
});
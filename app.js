// File: app.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { doc, setDoc, collection, addDoc, query, where, getDocs, getDoc, orderBy, limit, deleteDoc, updateDoc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
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
let currentFolderId = null;
let userFolders = [];
let selectedFolderIcon = 'fa-folder';
let selectedFolderColor = 'amber';
let isSelectionMode = false;
let selectedQuizIds = [];
let isBulkMoving = false;
const FOLDER_COLORS = {
    amber: {
        bg: 'bg-amber-50/50 hover:bg-amber-50 border-amber-100',
        iconBg: 'bg-amber-100 text-amber-600'
    },
    pink: {
        bg: 'bg-pink-50/50 hover:bg-pink-50 border-pink-100',
        iconBg: 'bg-pink-100 text-pink-600'
    },
    blue: {
        bg: 'bg-blue-50/50 hover:bg-blue-50 border-blue-100',
        iconBg: 'bg-blue-100 text-blue-600'
    },
    green: {
        bg: 'bg-green-50/50 hover:bg-green-50 border-green-100',
        iconBg: 'bg-green-100 text-green-600'
    },
    purple: {
        bg: 'bg-purple-50/50 hover:bg-purple-50 border-purple-100',
        iconBg: 'bg-purple-100 text-purple-600'
    },
    red: {
        bg: 'bg-red-50/50 hover:bg-red-50 border-red-100',
        iconBg: 'bg-red-100 text-red-600'
    },
    indigo: {
        bg: 'bg-indigo-50/50 hover:bg-indigo-50 border-indigo-100',
        iconBg: 'bg-indigo-100 text-indigo-600'
    }
};
const STATIC_COLOR_HEX = {
    amber: '#f59e0b',
    pink: '#ec4899',
    blue: '#3b82f6',
    green: '#10b981',
    purple: '#8b5cf6',
    red: '#ef4444',
    indigo: '#6366f1'
};
let progressChartInstance = null; // Biến để giữ instance của biểu đồ
let distributionChartInstance = null; // Biến để giữ instance của biểu đồ phân bố

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
async function handleFileSelect(e) {
    console.log('DEBUG: handleFileSelect triggered', e); 
    const file = e.target.files[0]; 
    if (!file) {
        console.log('No file selected');
        return;
    }
    fileNameElem.textContent = file.name; 
    questionCountInfo.textContent = 'Đang phân tích...'; 
    fileInfo.classList.remove('hidden'); 
    processBtn.classList.add('hidden'); 
    saveBtnPreQuiz.classList.add('hidden'); 
    try { 
        const parsedQuestions = await parseFile(file);
        console.log('Parsed questions:', parsedQuestions);
        if (parsedQuestions.length === 0) { 
            questionCountInfo.textContent = 'Lỗi: Không tìm thấy câu hỏi.'; 
            return; 
        } 
        const topics = parsedQuestions.map(q => q.topic); 
        const uniqueTopics = new Set(topics); 
        questions = parsedQuestions; 
        currentQuizTitle = file.name.replace(/\.(xlsx|xls|csv)$/, ''); 
        questionCountInfo.textContent = `✓ Tìm thấy ${questions.length} câu hỏi / ${uniqueTopics.size} chủ đề.`; 
        processBtn.classList.remove('hidden'); 
        saveBtnPreQuiz.classList.remove('hidden'); 
        saveBtnPreQuiz.disabled = false; 
        saveBtnPreQuiz.innerHTML = '<i class="fas fa-save mr-2"></i> Lưu vào thư viện'; 
    } catch (error) { 
        questionCountInfo.textContent = 'Lỗi! Không thể đọc file.'; 
        console.error("Lỗi phân tích file:", error); 
    } 
}
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
        note: ['note', 'ghi chú', 'ghi chu', 'chú thích', 'comment', 'remark', 'lưu ý', 'nhận xét', 'bổ sung', 'chú giải', 'chú ý'],
        expanded: ['expanded', 'mở rộng', 'mo rong', 'chi tiết mở rộng', 'extended content', 'nội dung mở rộng', 'phần mở rộng']
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
                // Cải tiến: Lấy tất cả các cột tiêu đề là alias của note, hoặc tiêu đề rỗng nằm cạnh cột ghi chú, hoặc tiêu đề chứa 'ghi chú', 'note'
                const noteIndexes = [];
                headers.forEach((h, idx) => {
                    const norm = (h || '').toLowerCase();
                    // Nếu là alias hoặc chứa 'ghi chú'/'note'
                    if (COLUMN_ALIASES.note.some(alias => norm === alias.trim().toLowerCase()) ||
                        norm.includes('ghi chú') || norm.includes('note')) {
                        noteIndexes.push(idx);
                        // Lấy luôn các cột rỗng tiếp theo (kiểu merge header)
                        let next = idx + 1;
                        while (next < headers.length && (!headers[next] || headers[next].trim() === '')) {
                            noteIndexes.push(next);
                            next++;
                        }
                    }
                });
                // Loại bỏ trùng lặp index
                const uniqueNoteIndexes = [...new Set(noteIndexes)];
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
                    const expandedIdx = colIdx['expanded'];
                    // Gộp tất cả các trường note nhỏ thành một chuỗi, mỗi trường một dòng
                    let noteValue = '';
                    if (uniqueNoteIndexes.length > 0) {
                        noteValue = uniqueNoteIndexes.map(idx => row[idx] || '').filter(val => val && String(val).trim() !== '').join('\n');
                    } else if (noteIdx !== undefined) {
                        noteValue = row[noteIdx] || '';
                    }
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
                        note: noteValue,
                        expanded: expandedIdx !== undefined ? (row[expandedIdx] || '') : ''
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
        console.log('DEBUG: Questions before saving:', questions);
        const docRef = await addDoc(collection(db, "quiz_sets"), {
            userId: user.uid,
            title: currentQuizTitle,
            questionCount: questions.length,
            questions: questions,
            createdAt: new Date(),
            isPublic: true // Luôn public bộ đề
        });
        console.log('DEBUG: Quiz saved with ID:', docRef.id);
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
        // Tải thư mục từ LocalStorage theo userId để tránh lỗi phân quyền Firestore Rules
        const localFoldersKey = `quiz_folders_${user.uid}`;
        userFolders = JSON.parse(localStorage.getItem(localFoldersKey) || '[]');

        // Tải bộ đề từ Firestore
        const q = query(collection(db, "quiz_sets"), where("userId", "==", user.uid), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        userQuizSets = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })); // Giữ lại biến cache nhưng không dùng cho tìm kiếm
        
        renderBreadcrumb();
        renderLibrary(userQuizSets);

    } catch (e) {
        console.error("Lỗi tải thư viện: ", e);
        quizListContainer.innerHTML = '<p class="text-red-500">Lỗi tải thư viện: ' + e.message + '</p>';
    }
}

function renderLibrary(quizzesToDisplay, page = 1) {
    const quizListContainer = document.getElementById('quiz-list-container');
    quizListContainer.innerHTML = '';

    const isSearching = document.getElementById('library-search-input')?.value.trim() !== '';

    // Lọc bộ đề theo thư mục nếu không đang tìm kiếm
    let filteredQuizzes = quizzesToDisplay;
    if (!isSearching) {
        filteredQuizzes = quizzesToDisplay.filter(quiz => 
            currentFolderId === null ? (!quiz.folderId) : (quiz.folderId === currentFolderId)
        );
    }

    // Nếu không tìm kiếm và ở Root, ta vẽ thêm danh sách thư mục lên trên cùng
    if (!isSearching && currentFolderId === null) {
        userFolders.forEach((folder) => {
            const card = document.createElement('div');
            const colorVal = folder.color || 'amber';
            const iconClass = folder.icon || 'fa-folder';
            const count = quizzesToDisplay.filter(q => q.folderId === folder.id).length;

            if (colorVal.startsWith('#')) {
                // Sử dụng inline style cho màu Hex custom
                card.style.backgroundColor = `${colorVal}14`; // ~8% opacity
                card.style.borderColor = `${colorVal}33`; // ~20% opacity
                card.className = 'rounded-xl p-4 flex flex-col justify-between cursor-pointer shadow-sm hover:shadow transition relative border';
                
                // Hiệu ứng hover đổi màu nền mịn màng động
                card.addEventListener('mouseenter', () => {
                    card.style.backgroundColor = `${colorVal}26`; // ~15% opacity
                });
                card.addEventListener('mouseleave', () => {
                    card.style.backgroundColor = `${colorVal}14`; // ~8% opacity
                });

                card.innerHTML = `
                    <div class="flex items-center gap-3 folder-click-area">
                        <div class="p-3 rounded-xl text-2xl flex-shrink-0 flex items-center justify-center w-12 h-12" style="background-color: ${colorVal}26; color: ${colorVal};">
                            <i class="fas ${iconClass}"></i>
                        </div>
                        <div class="flex-grow">
                            <h3 class="font-bold text-gray-700 text-base line-clamp-1">${folder.name}</h3>
                            <p class="text-xs text-gray-500 mt-0.5">${count} bộ đề</p>
                        </div>
                    </div>
                    <button class="folder-menu-btn absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-pink-500 focus:outline-none" data-id="${folder.id}"><i class="fas fa-ellipsis-h"></i></button>
                    <div class="folder-menu hidden absolute top-10 right-3 bg-white rounded-lg shadow-lg border border-pink-100 z-20 min-w-[120px]">
                        <button class="block w-full text-left px-4 py-2 text-gray-700 hover:bg-pink-50 rename-folder-btn" data-id="${folder.id}" data-name="${folder.name}"><i class="fas fa-edit mr-2 text-blue-400"></i>Đổi tên</button>
                        <button class="block w-full text-left px-4 py-2 text-red-700 hover:bg-pink-50 delete-folder-btn" data-id="${folder.id}"><i class="fas fa-trash-alt mr-2 text-red-400"></i>Xóa</button>
                    </div>
                `;
            } else {
                // Sử dụng FOLDER_COLORS tĩnh
                const theme = FOLDER_COLORS[colorVal] || FOLDER_COLORS['amber'];
                card.className = `rounded-xl p-4 flex flex-col justify-between cursor-pointer shadow-sm hover:shadow transition relative border ${theme.bg}`;
                card.innerHTML = `
                    <div class="flex items-center gap-3 folder-click-area">
                        <div class="p-3 rounded-xl text-2xl flex-shrink-0 flex items-center justify-center w-12 h-12 ${theme.iconBg}">
                            <i class="fas ${iconClass}"></i>
                        </div>
                        <div class="flex-grow">
                            <h3 class="font-bold text-gray-700 text-base line-clamp-1">${folder.name}</h3>
                            <p class="text-xs text-gray-500 mt-0.5">${count} bộ đề</p>
                        </div>
                    </div>
                    <button class="folder-menu-btn absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-pink-500 focus:outline-none" data-id="${folder.id}"><i class="fas fa-ellipsis-h"></i></button>
                    <div class="folder-menu hidden absolute top-10 right-3 bg-white rounded-lg shadow-lg border border-pink-100 z-20 min-w-[120px]">
                        <button class="block w-full text-left px-4 py-2 text-gray-700 hover:bg-pink-50 rename-folder-btn" data-id="${folder.id}" data-name="${folder.name}"><i class="fas fa-edit mr-2 text-blue-400"></i>Đổi tên</button>
                        <button class="block w-full text-left px-4 py-2 text-red-700 hover:bg-pink-50 delete-folder-btn" data-id="${folder.id}"><i class="fas fa-trash-alt mr-2 text-red-400"></i>Xóa</button>
                    </div>
                `;
            }
            
            // Xử lý sự kiện mở thư mục
            card.querySelector('.folder-click-area').addEventListener('click', () => {
                currentFolderId = folder.id;
                renderBreadcrumb();
                renderLibrary(quizzesToDisplay);
            });

            // Xử lý sự kiện mở menu thư mục
            const menuBtn = card.querySelector('.folder-menu-btn');
            const menu = card.querySelector('.folder-menu');
            menuBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                document.querySelectorAll('.quiz-menu, .folder-menu').forEach(m => {
                    if (m !== menu) m.classList.add('hidden');
                });
                menu.classList.toggle('hidden');
            });

            // Đổi tên thư mục
            card.querySelector('.rename-folder-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                menu.classList.add('hidden');
                openFolderModal('edit', folder.id, folder.name);
            });

            // Xóa thư mục
            card.querySelector('.delete-folder-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                menu.classList.add('hidden');
                confirmDeleteFolder(folder.id);
            });

            quizListContainer.appendChild(card);
        });
    }

    if (filteredQuizzes.length === 0 && (!userFolders.length || currentFolderId !== null || isSearching)) {
        const emptyMsg = document.createElement('p');
        emptyMsg.className = 'text-gray-500 col-span-full text-center py-6';
        emptyMsg.textContent = isSearching ? 'Không tìm thấy bộ đề nào khớp.' : 'Chưa có bộ đề nào trong thư mục này.';
        quizListContainer.appendChild(emptyMsg);
        return;
    }

    const ITEMS_PER_PAGE = 12;
    const totalPages = Math.ceil(filteredQuizzes.length / ITEMS_PER_PAGE);
    let currentPage = page;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const currentQuizzes = filteredQuizzes.slice(startIndex, endIndex);

    currentQuizzes.forEach((quizSet) => {
        const card = document.createElement('div');
        const isSelected = selectedQuizIds.includes(quizSet.id);
        
        let cardClass = 'bg-white rounded-lg shadow-md p-4 flex flex-col transition relative';
        if (isSelectionMode) {
            cardClass = isSelected 
                ? 'bg-white rounded-lg shadow-md p-4 flex flex-col cursor-pointer border-2 border-pink-500 bg-pink-50/20 transition relative'
                : 'bg-white rounded-lg shadow-md p-4 flex flex-col cursor-pointer border border-pink-100 transition relative';
        }
        card.className = cardClass;
        card.setAttribute('data-id', quizSet.id);

        let checkboxHTML = '';
        let menuHTML = '';
        if (isSelectionMode) {
            checkboxHTML = `
                <div class="absolute top-3 left-3 z-10">
                    <input type="checkbox" class="bulk-quiz-checkbox w-5 h-5 rounded border-pink-300 text-[#FF69B4] focus:ring-pink-300 cursor-pointer pointer-events-none" ${isSelected ? 'checked' : ''} />
                </div>
            `;
        } else {
            menuHTML = `
                <button class="quiz-menu-btn absolute top-2 right-2 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-pink-500 focus:outline-none" data-id="${quizSet.id}" title="Tuỳ chọn"><i class="fas fa-ellipsis-h"></i></button>
                <div class="quiz-menu hidden absolute top-10 right-2 bg-white rounded-lg shadow-lg border border-pink-100 z-20 min-w-[160px]">
                    <button class="block w-full text-left px-4 py-2 text-gray-700 hover:bg-pink-50 quiz-history-btn" data-id="${quizSet.id}"><i class="fas fa-history mr-2 text-pink-400"></i>Xem lịch sử làm bài</button>
                    <button class="block w-full text-left px-4 py-2 text-blue-700 hover:bg-pink-50 edit-quiz-content-btn" data-id="${quizSet.id}"><i class="fas fa-pen-alt mr-2 text-blue-400"></i>Sửa câu hỏi</button>
                    <button class="block w-full text-left px-4 py-2 text-gray-700 hover:bg-pink-50 edit-quiz-btn" data-id="${quizSet.id}" data-title="${quizSet.title}"><i class="fas fa-edit mr-2 text-blue-400"></i>Sửa tên</button>
                    <button class="block w-full text-left px-4 py-2 text-gray-700 hover:bg-pink-50 move-quiz-btn" data-id="${quizSet.id}"><i class="fas fa-folder-open mr-2 text-yellow-500"></i>Di chuyển thư mục</button>
                    <button class="block w-full text-left px-4 py-2 text-green-700 hover:bg-pink-50 share-quiz-btn" data-id="${quizSet.id}"><i class="fas fa-share-alt mr-2 text-green-400"></i>Chia sẻ</button>
                    <button class="block w-full text-left px-4 py-2 text-red-700 hover:bg-pink-50 delete-quiz-btn" data-id="${quizSet.id}"><i class="fas fa-trash-alt mr-2 text-red-400"></i>Xóa</button>
                </div>
            `;
        }

        card.innerHTML = `
            ${checkboxHTML}
            <div class="flex-grow relative ${isSelectionMode ? 'pl-8' : ''}">
                <h3 class="text-md font-bold text-gray-700">${quizSet.title}</h3>
                <p class="text-sm text-gray-500 mt-2">${quizSet.questionCount} câu hỏi</p>
                <p class="text-xs text-gray-400 mt-1">Lưu ngày: ${new Date(quizSet.createdAt.toDate()).toLocaleDateString()}</p>
                ${menuHTML}
            </div>
            <div class="mt-4 flex flex-col gap-2 ${isSelectionMode ? 'opacity-40 pointer-events-none' : ''}">
                <a href="quiz.html?id=${quizSet.id}" class="w-full text-center px-4 py-3 bg-[#FF69B4] text-white rounded-lg hover:bg-opacity-80 transition text-lg font-bold">Bắt đầu</a>
            </div>
        `;
        
        quizListContainer.appendChild(card);

        // --- Sự kiện click card khi ở chế độ chọn nhiều ---
        card.addEventListener('click', function(e) {
            if (!isSelectionMode || e.target.closest('a')) return;
            
            e.preventDefault();
            e.stopPropagation();

            const checkbox = card.querySelector('.bulk-quiz-checkbox');
            const hasId = selectedQuizIds.includes(quizSet.id);
            
            if (hasId) {
                selectedQuizIds = selectedQuizIds.filter(id => id !== quizSet.id);
                card.className = 'bg-white rounded-lg shadow-md p-4 flex flex-col cursor-pointer border border-pink-100 transition relative';
                if (checkbox) checkbox.checked = false;
            } else {
                selectedQuizIds.push(quizSet.id);
                card.className = 'bg-white rounded-lg shadow-md p-4 flex flex-col cursor-pointer border-2 border-pink-500 bg-pink-50/20 transition relative';
                if (checkbox) checkbox.checked = true;
            }
            updateBulkActionsToolbar();
        });

        // --- Cơ chế nhận diện giữ lâu (Long Press) ---
        let longPressTimer = null;
        let isLongPressTriggered = false;

        const startPress = (e) => {
            if (isSelectionMode || e.target.closest('a') || e.target.closest('.quiz-menu-btn') || e.target.closest('.quiz-menu')) return;
            
            isLongPressTriggered = false;
            longPressTimer = setTimeout(() => {
                isLongPressTriggered = true;
                isSelectionMode = true;
                selectedQuizIds = [quizSet.id];
                
                if (navigator.vibrate) navigator.vibrate(50);
                
                renderLibrary(quizzesToDisplay, currentPage);
                updateBulkActionsToolbar();
            }, 600);
        };

        const cancelPress = () => {
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        };

        card.addEventListener('mousedown', startPress);
        card.addEventListener('touchstart', startPress, { passive: true });
        
        card.addEventListener('mouseup', (e) => {
            cancelPress();
            if (isLongPressTriggered) {
                e.preventDefault();
                e.stopPropagation();
            }
        });
        card.addEventListener('touchend', (e) => {
            cancelPress();
            if (isLongPressTriggered) {
                e.preventDefault();
                e.stopPropagation();
            }
        });

        card.addEventListener('mouseleave', cancelPress);
        card.addEventListener('touchmove', cancelPress, { passive: true });
        card.addEventListener('touchcancel', cancelPress);

        // Thêm event cho nút chia sẻ (chỉ khi không ở chế độ chọn)
        setTimeout(() => { 
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

            const moveBtn = card.querySelector('.move-quiz-btn');
            if (moveBtn) {
                moveBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    const quizId = this.getAttribute('data-id');
                    isBulkMoving = false;
                    openMoveQuizModal(quizId);
                });
            }
        }, 0);
    });

    renderLibraryPagination(filteredQuizzes, currentPage, totalPages);
}

function renderLibraryPagination(quizzesToDisplay, currentPage, totalPages) {
    let paginationContainer = document.getElementById('library-pagination');
    if (!paginationContainer) {
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'library-pagination';
        paginationContainer.className = 'flex justify-center items-center gap-4 mt-6 col-span-full w-full';
        
        const quizListContainer = document.getElementById('quiz-list-container');
        if (quizListContainer && quizListContainer.parentNode) {
            quizListContainer.parentNode.insertBefore(paginationContainer, quizListContainer.nextSibling);
        }
    }

    if (totalPages <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }

    paginationContainer.innerHTML = `
        <button id="lib-prev-page" class="px-4 py-2 bg-pink-100 text-pink-700 rounded-lg hover:bg-pink-200 transition disabled:opacity-50 disabled:cursor-not-allowed" ${currentPage === 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left mr-1"></i> Trang trước
        </button>
        <span class="text-gray-700 font-medium">Trang ${currentPage} / ${totalPages}</span>
        <button id="lib-next-page" class="px-4 py-2 bg-pink-100 text-pink-700 rounded-lg hover:bg-pink-200 transition disabled:opacity-50 disabled:cursor-not-allowed" ${currentPage === totalPages ? 'disabled' : ''}>
            Trang sau <i class="fas fa-chevron-right ml-1"></i>
        </button>
    `;

    document.getElementById('lib-prev-page').addEventListener('click', () => {
        if (currentPage > 1) renderLibrary(quizzesToDisplay, currentPage - 1);
    });

    document.getElementById('lib-next-page').addEventListener('click', () => {
        if (currentPage < totalPages) renderLibrary(quizzesToDisplay, currentPage + 1);
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
    'Ghi chú (Note)', // hoặc: note, ghi chú, comment
    'Mở rộng' // hoặc: expanded, mở rộng, chi tiết mở rộng
  ],
  [
    'Lưu ý: Các cột có dấu ★ là bắt buộc phải nhập. Các cột còn lại có thể bỏ trống.', '', '', '', '', '', '', '', '', '', '', ''
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
    'Câu hỏi cơ bản',
    'Hà Nội có diện tích khoảng 3.344 km², với dân số hơn 8 triệu người.'
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
    'Có thể gây nhầm lẫn cho học sinh',
    'Vitamin B gồm: B1 (thiamine), B2 (riboflavin), B3 (niacin), B5 (pantothenic acid), B6 (pyridoxine), B7 (biotin), B9 (folate), B12 (cobalamine).'
  ]
];
const worksheet = XLSX.utils.aoa_to_sheet(sampleData);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, "Zitthenkne Mau");
worksheet['!cols'] = [
  {wch: 50}, {wch: 25}, {wch: 25}, {wch: 25}, {wch: 25},
  {wch: 30}, {wch: 25}, {wch: 50}, {wch: 30}, {wch: 20}, {wch: 30}, {wch: 50}
];
XLSX.writeFile(workbook, "File mẫu nè.xlsx");
}
function initGpaCalculator() {
    const btn = document.getElementById('calculate-gpa-btn');
    if (btn && !btn.dataset.listenerAdded) {
        btn.addEventListener('click', calculateGPA);
        btn.dataset.listenerAdded = 'true';
    }
    // Init gpa-calculator-js tiện ích nếu cần
    if (typeof renderAttemptsTable === 'function') {
        renderAttemptsTable();
        const examType = document.getElementById('exam-type');
        if (examType && !examType.dataset.listenerAdded) {
            examType.addEventListener('change', renderAttemptsTable);
            examType.dataset.listenerAdded = 'true';
        }
        const numAttempts = document.getElementById('num-attempts');
        if (numAttempts && !numAttempts.dataset.listenerAdded) {
            numAttempts.addEventListener('change', renderAttemptsTable);
            numAttempts.dataset.listenerAdded = 'true';
        }
        const calcRequiredBtn = document.getElementById('calculate-required-btn');
        if (calcRequiredBtn && !calcRequiredBtn.dataset.listenerAdded) {
            calcRequiredBtn.addEventListener('click', calculateRequiredCorrectAnswers);
            calcRequiredBtn.dataset.listenerAdded = 'true';
        }
    }
}

function calculateGPA() {
    const correctAnswersInput = document.getElementById('correct-answers');
    const totalQuestionsInput = document.getElementById('total-questions');
    const resultArea = document.getElementById('gpa-result-area');
    const score10Text = document.getElementById('gpa-score10-text');
    const score4Text = document.getElementById('gpa-score4-text');
    const letterGradeText = document.getElementById('gpa-letter-grade');
    const motivationText = document.getElementById('gpa-motivation-text');
    const squirrelImg = document.getElementById('gpa-squirrel-img');

    const x = parseInt(correctAnswersInput.value, 10);
    const y = parseInt(totalQuestionsInput.value, 10);

    if (isNaN(x) || isNaN(y) || y <= 0 || x < 0 || x > y) {
        showToast('Vui lòng nhập số câu hợp lệ!', 'warning');
        correctAnswersInput.classList.add('border-red-400');
        totalQuestionsInput.classList.add('border-red-400');
        return;
    }
    correctAnswersInput.classList.remove('border-red-400');
    totalQuestionsInput.classList.remove('border-red-400');

    const n = x / y;
    let score10;

    if (n < 0.5) {
        score10 = (8 * x) / y;
    } else if (n === 0.5) {
        score10 = 4.0;
    } else if (n > 0.5 && n < 0.6) {
        score10 = 4 + (10 * (x - 0.5 * y)) / y;
    } else if (n === 0.6) {
        score10 = 5.0;
    } else {
        score10 = 5 + (12.5 * (x - 0.6 * y)) / y;
    }

    let score4, letterGrade, motivation, img, gradeBg, gradeColor, gradeBorder, gradeEmoji;

    if (score10 >= 9.5) {
        score4 = 4.0; letterGrade = 'A+';
        img = 'assets/squirrel_A.png';
        motivation = "Ối dồi ôi, ối dồi ôi, trình là j mà là trình ai chấm!!! Anh chỉ biết làm ba mẹ anh tự hào, xây căn nhà thật to ở 1 mình 2 tấm";
        gradeBg = 'from-yellow-50 to-amber-50'; gradeColor = 'text-amber-500'; gradeBorder = 'border-amber-300'; gradeEmoji = '🏆';
    } else if (score10 >= 8.5) {
        score4 = 4.0; letterGrade = 'A';
        img = 'assets/squirrel_A.png';
        motivation = "Dỏi dữ dị bà, trộm vía trộm víaaaaaa, xin vía 4.0 <3";
        gradeBg = 'from-yellow-50 to-orange-50'; gradeColor = 'text-orange-400'; gradeBorder = 'border-orange-300'; gradeEmoji = '🌟';
    } else if (score10 >= 8.0) {
        score4 = 3.5; letterGrade = 'B+';
        img = 'assets/squirrel_B.png';
        motivation = "gút chóp bây bề";
        gradeBg = 'from-green-50 to-emerald-50'; gradeColor = 'text-emerald-500'; gradeBorder = 'border-emerald-300'; gradeEmoji = '✨';
    } else if (score10 >= 7.0) {
        score4 = 3.0; letterGrade = 'B';
        img = 'assets/squirrel_B.png';
        motivation = "Quaooooooo, vá là dỏi òiiiiii";
        gradeBg = 'from-green-50 to-teal-50'; gradeColor = 'text-teal-500'; gradeBorder = 'border-teal-300'; gradeEmoji = '💚';
    } else if (score10 >= 6.5) {
        score4 = 2.5; letterGrade = 'C+';
        img = 'assets/squirrel_C.png';
        motivation = "Điểm này là cũng cũng ròi á mom, u so gud babi";
        gradeBg = 'from-blue-50 to-sky-50'; gradeColor = 'text-sky-500'; gradeBorder = 'border-sky-300'; gradeEmoji = '💙';
    } else if (score10 >= 5.5) {
        score4 = 2.0; letterGrade = 'C';
        img = 'assets/squirrel_C.png';
        motivation = "Cũn cũn ik, cố gắng lên nhennn";
        gradeBg = 'from-pink-50 to-rose-50'; gradeColor = 'text-rose-400'; gradeBorder = 'border-rose-300'; gradeEmoji = '🌸';
    } else if (score10 >= 5.0) {
        score4 = 1.5; letterGrade = 'D+';
        img = 'assets/squirrel_D.png';
        motivation = "Vừa đủ qua. Cần xem lại kiến thức một chút.";
        gradeBg = 'from-purple-50 to-violet-50'; gradeColor = 'text-violet-500'; gradeBorder = 'border-violet-300'; gradeEmoji = '🔮';
    } else if (score10 >= 4.0) {
        score4 = 1.0; letterGrade = 'D';
        img = 'assets/squirrel_D.png';
        motivation = "Qua môn rồi! Chúc mừng nha bàaaaa";
        gradeBg = 'from-orange-50 to-yellow-50'; gradeColor = 'text-yellow-500'; gradeBorder = 'border-yellow-300'; gradeEmoji = '🌻';
    } else {
        score4 = 0.0; letterGrade = 'F';
        img = 'assets/squirrel_F.png';
        motivation = "Hoi mò hoi mò, lần sau sẽ tốt hơn mà!";
        gradeBg = 'from-gray-50 to-slate-50'; gradeColor = 'text-gray-500'; gradeBorder = 'border-gray-300'; gradeEmoji = '🐿️';
    }

    const percentage = Math.round((x / y) * 100);

    // Cập nhật giao diện kết quả nâng cấp
    resultArea.className = `mt-6 p-6 rounded-2xl border-2 bg-gradient-to-br ${gradeBg} ${gradeBorder} transition-all duration-500`;
    resultArea.innerHTML = `
        <div class="flex flex-col items-center gap-4">
            <!-- Hình sóc -->
            <div class="relative">
                <img src="${img}" alt="Sóc con" class="w-32 h-32 object-contain drop-shadow-lg animate-bounce" style="animation-duration:2s">
                <span class="absolute -top-2 -right-2 text-3xl">${gradeEmoji}</span>
            </div>
            <!-- Câu động lực -->
            <p class="text-sm sm:text-base font-semibold text-gray-600 text-center italic px-4 leading-relaxed">"${motivation}"</p>
            <!-- Điểm lớn -->
            <div class="flex justify-center gap-4 sm:gap-8 w-full mt-2">
                <div class="flex flex-col items-center bg-white/80 rounded-2xl shadow px-4 py-3 min-w-[72px]">
                    <span class="text-xs text-gray-500 font-medium mb-1">Hệ 10</span>
                    <span class="${gradeColor} text-3xl font-extrabold">${score10.toFixed(2)}</span>
                </div>
                <div class="flex flex-col items-center bg-white/80 rounded-2xl shadow px-4 py-3 min-w-[72px]">
                    <span class="text-xs text-gray-500 font-medium mb-1">Hệ 4</span>
                    <span class="${gradeColor} text-3xl font-extrabold">${score4.toFixed(1)}</span>
                </div>
                <div class="flex flex-col items-center bg-white/80 rounded-2xl shadow px-4 py-3 min-w-[72px]">
                    <span class="text-xs text-gray-500 font-medium mb-1">Điểm chữ</span>
                    <span class="${gradeColor} text-3xl font-extrabold">${letterGrade}</span>
                </div>
            </div>
            <!-- Thanh progress -->
            <div class="w-full mt-2">
                <div class="flex justify-between text-xs text-gray-500 mb-1 font-medium">
                    <span>Tỉ lệ đúng</span>
                    <span>${x}/${y} câu (${percentage}%)</span>
                </div>
                <div class="w-full h-4 bg-gray-200 rounded-full overflow-hidden shadow-inner">
                    <div class="h-full rounded-full transition-all duration-1000 ${gradeColor.replace('text-', 'bg-')}" style="width:${percentage}%"></div>
                </div>
            </div>
        </div>
    `;

    resultArea.classList.remove('hidden');
    // Scroll nhẹ vào kết quả
    setTimeout(() => resultArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
}

// HÀM MỚI: Tải và hiển thị toàn bộ trang thống kê
// HÀM loadAndDisplayStats ĐÃ ĐƯỢC NÂNG CẤP HOÀN CHỈNH
async function loadAndDisplayStats() {
    const user = auth.currentUser;
    const achievementsContainer = document.getElementById('achievements-container');
    const statsContainer = document.getElementById('stats-container');
    const progressChartCanvas = document.getElementById('progressChart');
    const distributionChartCanvas = document.getElementById('distributionChart');
    
    // Reset các thẻ Stats Cards
    const totalAttemptsEl = document.getElementById('stat-total-attempts');
    const avgScore10El = document.getElementById('stat-avg-score10');
    const avgGpaEl = document.getElementById('stat-avg-gpa');
    const passRateEl = document.getElementById('stat-pass-rate');

    if (totalAttemptsEl) totalAttemptsEl.textContent = '0';
    if (avgScore10El) avgScore10El.textContent = '0.0';
    if (avgGpaEl) avgGpaEl.textContent = '0.0';
    if (passRateEl) passRateEl.textContent = '0%';

    // Reset giao diện thành tựu và lịch sử
    achievementsContainer.innerHTML = '';
    statsContainer.innerHTML = '';

    if (!user) {
        achievementsContainer.innerHTML = '<p class="text-gray-500 col-span-full text-center py-6">Vui lòng đăng nhập để xem thành tựu.</p>';
        statsContainer.innerHTML = '<p class="text-gray-500 py-8 text-center w-full col-span-full">Vui lòng đăng nhập để xem lịch sử.</p>';
        if (progressChartInstance) {
            progressChartInstance.destroy();
            progressChartInstance = null;
        }
        if (distributionChartInstance) {
            distributionChartInstance.destroy();
            distributionChartInstance = null;
        }
        return;
    }

    try {
        // 1. Tải và hiển thị thành tựu
        const allAchievements = Object.values(achievements);
        
        // Tạo các placeholder cho thành tựu
        allAchievements.forEach(ach => {
            const achievementEl = document.createElement('div');
            achievementEl.className = 'flex flex-col items-center gap-2 opacity-40 grayscale transition-all duration-300 hover:scale-105'; // Mặc định mờ và xám
            achievementEl.id = `achievement-${ach.name.replace(/\s/g, '-')}`;
            achievementEl.innerHTML = `
                <div class="bg-white p-3 rounded-2xl shadow-sm border border-gray-100 relative group cursor-help">
                    <img src="${ach.img}" alt="${ach.name}" class="w-20 h-20 object-cover rounded-xl mx-auto">
                    <div class="absolute inset-0 bg-black/60 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2 text-[10px] text-white font-medium text-center">
                        ${ach.description || 'Thành tựu đặc biệt'}
                    </div>
                </div>
                <p class="font-bold text-xs text-gray-700 mt-1">${ach.name}</p>
            `;
            achievementsContainer.appendChild(achievementEl);
        });

        // Tải thành tựu người dùng đã mở khóa
        const achievementsQuery = query(collection(db, "users", user.uid, "achievements"));
        const achievementsSnapshot = await getDocs(achievementsQuery);
        
        if (!achievementsSnapshot.empty) {
            achievementsSnapshot.forEach(doc => {
                const unlockedAchievement = achievements[doc.id];
                if (unlockedAchievement) {
                    const targetEl = document.getElementById(`achievement-${unlockedAchievement.name.replace(/\s/g, '-')}`);
                    if (targetEl) {
                        targetEl.classList.remove('opacity-40', 'grayscale');
                        targetEl.classList.add('fade-in');
                        // Thêm viền màu vàng gold phát sáng cho thành tựu đã mở
                        const imgWrapper = targetEl.querySelector('div');
                        if (imgWrapper) {
                            imgWrapper.classList.add('ring-4', 'ring-amber-400', 'ring-offset-2');
                        }
                    }
                }
            });
        }
        
        // 2. Tải và hiển thị lịch sử làm bài
        const resultsQuery = query(collection(db, "quiz_results"), where("userId", "==", user.uid), orderBy("completedAt", "asc"));
        const resultsSnapshot = await getDocs(resultsQuery);
        const results = resultsSnapshot.docs.map(doc => doc.data());

        if (results.length === 0) {
            statsContainer.innerHTML = '<p class="text-gray-500 py-8 text-center w-full col-span-full">Bạn chưa hoàn thành bài test nào.</p>';
            if (progressChartInstance) {
                progressChartInstance.destroy();
                progressChartInstance = null;
            }
            if (distributionChartInstance) {
                distributionChartInstance.destroy();
                distributionChartInstance = null;
            }
        } else {
            // Helper chuyển đổi GPA và Điểm chữ
            function calculateGPA(percentage) {
                const score10 = percentage / 10;
                let score4 = 0.0;
                let letterGrade = 'F';
                if (score10 >= 9.5) { score4 = 4.0; letterGrade = 'A+'; }
                else if (score10 >= 8.5) { score4 = 4.0; letterGrade = 'A'; }
                else if (score10 >= 8.0) { score4 = 3.5; letterGrade = 'B+'; }
                else if (score10 >= 7.0) { score4 = 3.0; letterGrade = 'B'; }
                else if (score10 >= 6.5) { score4 = 2.5; letterGrade = 'C+'; }
                else if (score10 >= 5.5) { score4 = 2.0; letterGrade = 'C'; }
                else if (score10 >= 5.0) { score4 = 1.5; letterGrade = 'D+'; }
                else if (score10 >= 4.0) { score4 = 1.0; letterGrade = 'D'; }
                else { score4 = 0.0; letterGrade = 'F'; }
                return { score4, letterGrade };
            }

            function formatDuration(seconds) {
                if (!seconds) return 'N/A';
                const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
                const secs = (seconds % 60).toString().padStart(2, '0');
                return `${mins}:${secs}`;
            }

            // Tính toán số liệu thống kê
            const totalAttempts = results.length;
            let totalPercentage = 0;
            let totalGPA = 0;
            let passAttempts = 0;
            const gradesCount = { 'A': 0, 'B': 0, 'C': 0, 'D': 0, 'F': 0 };

            // Hiển thị lịch sử làm bài (từ mới đến cũ để tiện xem nhật ký gần đây trước)
            const sortedResultsForList = [...results].reverse();

            results.forEach(result => {
                totalPercentage += result.percentage;
                
                const { score4, letterGrade } = calculateGPA(result.percentage);
                totalGPA += score4;
                
                if (result.percentage >= 40) passAttempts++; // Điểm chữ D (hệ 10 >= 4.0) trở lên được coi là qua môn
                
                if (letterGrade.startsWith('A')) gradesCount['A']++;
                else if (letterGrade.startsWith('B')) gradesCount['B']++;
                else if (letterGrade.startsWith('C')) gradesCount['C']++;
                else if (letterGrade.startsWith('D')) gradesCount['D']++;
                else gradesCount['F']++;
            });

            // Vẽ danh sách lịch sử (đảo ngược để bài mới nhất lên đầu)
            sortedResultsForList.forEach(result => {
                const resultEl = document.createElement('div');
                const isPassed = result.percentage >= 40;
                const timeStr = formatDuration(result.timeTaken);
                
                resultEl.className = 'px-6 py-4 hover:bg-pink-50/20 transition-all flex flex-col sm:flex-row justify-between sm:items-center gap-4';
                resultEl.innerHTML = `
                    <div class="flex items-center gap-3">
                        <div class="p-2.5 rounded-full ${isPassed ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}">
                            <i class="fas ${isPassed ? 'fa-check' : 'fa-exclamation'} text-sm w-4 text-center"></i>
                        </div>
                        <div>
                            <p class="font-semibold text-gray-800 text-base">${result.quizTitle}</p>
                            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400 mt-0.5">
                                <span><i class="far fa-calendar-alt mr-1"></i>${new Date(result.completedAt.toDate()).toLocaleString()}</span>
                                <span><i class="far fa-clock mr-1"></i>Thời gian: ${timeStr}</span>
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center justify-between sm:justify-end gap-4">
                        <span class="px-2.5 py-1 rounded-full text-xs font-bold ${isPassed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                            ${isPassed ? 'Qua môn' : 'Thi lại'}
                        </span>
                        <div class="text-right">
                            <p class="font-extrabold text-xl text-[#FF69B4]">${result.percentage}%</p>
                            <p class="text-xs text-gray-500 font-medium">${result.score}/${result.totalQuestions} câu</p>
                        </div>
                    </div>
                `;
                statsContainer.appendChild(resultEl);
            });

            // Gán dữ liệu Stats Cards vào DOM
            const avgPercentage = totalPercentage / totalAttempts;
            const avgScore10 = (avgPercentage / 10).toFixed(1);
            const avgGPA = (totalGPA / totalAttempts).toFixed(2);
            const passRate = Math.round((passAttempts / totalAttempts) * 100);

            if (totalAttemptsEl) totalAttemptsEl.textContent = totalAttempts;
            if (avgScore10El) avgScore10El.textContent = avgScore10;
            if (avgGpaEl) avgGpaEl.textContent = avgGPA;
            if (passRateEl) passRateEl.textContent = passRate + '%';

            // 3. Vẽ biểu đồ tiến độ Progress Chart (Line)
            const chartLabels = results.map((r, index) => `Lần ${index + 1}`);
            const chartData = results.map(r => r.percentage);
            
            if (progressChartInstance) {
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
                        borderWidth: 3,
                        pointBackgroundColor: '#FF69B4',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 2,
                        pointRadius: 5,
                        pointHoverRadius: 7,
                        tension: 0.35
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            grid: { color: 'rgba(0, 0, 0, 0.05)' }
                        },
                        x: {
                            grid: { display: false }
                        }
                    }
                }
            });

            // 4. Vẽ biểu đồ phân bố học lực Distribution Chart (Doughnut)
            if (distributionChartInstance) {
                distributionChartInstance.destroy();
            }

            distributionChartInstance = new Chart(distributionChartCanvas, {
                type: 'doughnut',
                data: {
                    labels: ['Giỏi (A/A+)', 'Khá (B/B+)', 'TB Khá (C/C+)', 'TB (D/D+)', 'Yếu (F)'],
                    datasets: [{
                        data: [gradesCount['A'], gradesCount['B'], gradesCount['C'], gradesCount['D'], gradesCount['F']],
                        backgroundColor: ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#9CA3AF'],
                        borderWidth: 2,
                        borderColor: '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { boxWidth: 10, font: { size: 11 } }
                        }
                    },
                    cutout: '65%'
                }
            });
        }
    } catch (e) {
        console.error("Lỗi tải trang thống kê: ", e);
        achievementsContainer.innerHTML = '<p class="text-red-500 col-span-full py-6">Lỗi tải thành tựu.</p>';
        statsContainer.innerHTML = '<p class="text-red-500 p-6 w-full col-span-full">Lỗi tải lịch sử làm bài.</p>';
    }
}

// NEW: Function to load and display user's study rooms

        // HÀM MỚI: Tính số câu cần đạt ở lần thi tới để đạt điểm hệ 4 mong muốn
        function calculateRequiredCorrectAnswers() {
            // Lấy các input
            const totalQuestionsInput = document.getElementById('total-questions-next');
            const desiredGPAInput = document.getElementById('desired-gpa-4');
            const numAttemptsInput = document.getElementById('num-attempts');
            const resultArea = document.getElementById('required-correct-result');

            const totalQuestions = parseInt(totalQuestionsInput.value, 10);
            const desiredGPA = parseFloat(desiredGPAInput.value);
            const numAttempts = parseInt(numAttemptsInput.value, 10);
            if (isNaN(totalQuestions) || totalQuestions <= 0 || isNaN(desiredGPA) || desiredGPA < 0 || desiredGPA > 4 || isNaN(numAttempts) || numAttempts < 1) {
                resultArea.textContent = 'Vui lòng nhập thông tin hợp lệ.';
                return;
            }

            // Chuyển điểm hệ 4 sang hệ 10
            let desiredScore10;
            if (desiredGPA >= 3.8) desiredScore10 = 9.5;
            else if (desiredGPA >= 3.5) desiredScore10 = 8.5;
            else if (desiredGPA >= 3.2) desiredScore10 = 7.0;
            else if (desiredGPA >= 2.5) desiredScore10 = 5.5;
            else if (desiredGPA >= 2.0) desiredScore10 = 4.0;
            else desiredScore10 = 0;

            // Tính tổng số câu đã đúng và tổng phần trăm đã thi
            let totalPercent = 0;
            let weightedCorrect = 0;
            if (examType === 'pretest') {
                // Lấy điểm pretest
                const pretestScore = parseFloat(document.querySelector('.attempt-pretest-score')?.value) || 0;
                // Cộng phần trăm pretest
                const pretestPercent = parseFloat(percentInputs[0].value) || 0;
                totalPercent += pretestPercent;
                // Giữa kỳ và cuối kỳ
                for (let i = 0; i < 2; i++) {
                    const percent = parseFloat(percentInputs[i+1].value) || 0;
                    const correct = correctInputs[i] && correctInputs[i].value !== '' ? parseInt(correctInputs[i].value, 10) : null;
                    totalPercent += percent;
                    if (correct !== null) weightedCorrect += correct * percent;
                }
                // Tính toán với điểm pretest
                // weightedCorrect += pretestScore * pretestPercent (nếu cần dùng điểm pretest vào công thức)
            } else {
                for (let i = 0; i < numAttempts - 1; i++) {
                    const percent = parseFloat(percentInputs[i].value) || 0;
                    const correct = correctInputs[i] && correctInputs[i].value !== '' ? parseInt(correctInputs[i].value, 10) : null;
                    totalPercent += percent;
                    if (correct !== null) weightedCorrect += correct * percent;
                }
            }
            let nextPercent;
            if (examType === 'pretest') {
                // nextPercent là phần trăm cuối kỳ
                nextPercent = parseFloat(percentInputs[2].value) || 0;
                // Tổng phần trăm là pretest + giữa kỳ + cuối kỳ
                if ((parseFloat(percentInputs[0].value) || 0) + (parseFloat(percentInputs[1].value) || 0) + nextPercent !== 100) {
                    resultArea.textContent = 'Tổng phần trăm các lần thi phải bằng 100%.';
                    return;
                }
            } else {
                nextPercent = parseFloat(percentInputs[numAttempts - 1].value) || 0;
                if (totalPercent + nextPercent !== 100) {
                    resultArea.textContent = 'Tổng phần trăm các lần thi phải bằng 100%.';
                    return;
                }
            }

            // Tính số câu cần đúng ở lần thi tới
            const requiredSum = desiredScore10 * totalQuestions * 10;
            const x = Math.ceil((requiredSum - weightedCorrect) / nextPercent);
            if (x < 0) {
                resultArea.textContent = 'Bạn đã đủ điểm mong muốn!';
            } else if (x > totalQuestions) {
                resultArea.textContent = 'Không thể đạt điểm mong muốn với số câu này.';
            } else {
                resultArea.textContent = `Bạn cần đúng ít nhất ${x} câu trong lần thi tới để đạt điểm hệ 4 mong muốn.`;
            }
        }
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
    if (selectGpaCalculatorBtn) selectGpaCalculatorBtn.addEventListener('click', () => {
        showContent('gpaCalculatorContent', 'Tính Điểm Hệ 4');
        initGpaCalculator();
    });
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

    // Sự kiện quản lý thư mục
    const createFolderBtn = document.getElementById('create-folder-btn');
    if (createFolderBtn) createFolderBtn.addEventListener('click', () => openFolderModal('create'));

    const closeFolderModalBtn = document.getElementById('closeFolderModalBtn');
    if (closeFolderModalBtn) closeFolderModalBtn.addEventListener('click', closeFolderModal);

    const saveFolderBtn = document.getElementById('saveFolderBtn');
    if (saveFolderBtn) saveFolderBtn.addEventListener('click', saveFolder);

    const closeMoveQuizModalBtn = document.getElementById('closeMoveQuizModalBtn');
    if (closeMoveQuizModalBtn) closeMoveQuizModalBtn.addEventListener('click', closeMoveQuizModal);

    const confirmMoveQuizBtn = document.getElementById('confirmMoveQuizBtn');
    if (confirmMoveQuizBtn) confirmMoveQuizBtn.addEventListener('click', confirmMoveQuiz);

    // Sự kiện Chọn nhiều bộ đề
    const bulkSelectToggleBtn = document.getElementById('bulk-select-toggle-btn');
    if (bulkSelectToggleBtn) {
        bulkSelectToggleBtn.addEventListener('click', () => {
            if (!isSelectionMode) {
                isSelectionMode = true;
                selectedQuizIds = [];
                updateBulkActionsToolbar();
                bulkSelectToggleBtn.classList.remove('bg-gray-100', 'text-gray-700');
                bulkSelectToggleBtn.classList.add('bg-pink-100', 'text-pink-700', 'border-pink-300');
                bulkSelectToggleBtn.innerHTML = '<i class="fas fa-check-square"></i> Đang chọn...';
                loadAndDisplayLibrary();
            } else {
                exitSelectionMode();
            }
        });
    }

    const bulkSelectAllBtn = document.getElementById('bulk-select-all-btn');
    if (bulkSelectAllBtn) {
        bulkSelectAllBtn.addEventListener('click', () => {
            const cards = document.querySelectorAll('#quiz-list-container .bulk-quiz-checkbox');
            const newIds = [];
            cards.forEach(cb => {
                const cardEl = cb.closest('[data-id]');
                if (cardEl) {
                    const id = cardEl.getAttribute('data-id');
                    if (id) newIds.push(id);
                }
            });
            
            selectedQuizIds = Array.from(new Set([...selectedQuizIds, ...newIds]));
            
            cards.forEach(cb => {
                cb.checked = true;
                const cardEl = cb.closest('[data-id]');
                if (cardEl) {
                    cardEl.className = 'bg-white rounded-lg shadow-md p-4 flex flex-col cursor-pointer border-2 border-pink-500 bg-pink-50/20 transition relative';
                }
            });
            updateBulkActionsToolbar();
        });
    }

    const bulkDeselectAllBtn = document.getElementById('bulk-deselect-all-btn');
    if (bulkDeselectAllBtn) {
        bulkDeselectAllBtn.addEventListener('click', () => {
            const cards = document.querySelectorAll('#quiz-list-container .bulk-quiz-checkbox');
            cards.forEach(cb => {
                cb.checked = false;
                const cardEl = cb.closest('[data-id]');
                if (cardEl) {
                    const id = cardEl.getAttribute('data-id');
                    if (id) {
                        selectedQuizIds = selectedQuizIds.filter(qId => qId !== id);
                    }
                    cardEl.className = 'bg-white rounded-lg shadow-md p-4 flex flex-col cursor-pointer border border-pink-100 transition relative';
                }
            });
            updateBulkActionsToolbar();
        });
    }

    const bulkCancelBtn = document.getElementById('bulk-cancel-btn');
    if (bulkCancelBtn) bulkCancelBtn.addEventListener('click', exitSelectionMode);

    const bulkDeleteBtn = document.getElementById('bulk-delete-btn');
    if (bulkDeleteBtn) {
        bulkDeleteBtn.addEventListener('click', async () => {
            if (selectedQuizIds.length === 0) {
                if (typeof showToast === 'function') showToast('Vui lòng chọn ít nhất một bộ đề để xóa!', 'warning');
                else alert('Vui lòng chọn ít nhất một bộ đề để xóa!');
                return;
            }
            if (confirm(`Bạn có chắc chắn muốn xóa ${selectedQuizIds.length} bộ đề đã chọn? Hành động này không thể hoàn tác.`)) {
                try {
                    await Promise.all(selectedQuizIds.map(id => deleteDoc(doc(db, "quiz_sets", id))));
                    if (typeof showToast === 'function') showToast(`Đã xóa ${selectedQuizIds.length} bộ đề thành công!`, 'success');
                    else alert(`Đã xóa ${selectedQuizIds.length} bộ đề thành công!`);
                    exitSelectionMode();
                } catch (err) {
                    console.error("Lỗi khi xóa đồng loạt:", err);
                    if (typeof showToast === 'function') showToast("Xóa đồng loạt thất bại!", 'error');
                    else alert("Xóa đồng loạt thất bại!");
                }
            }
        });
    }

    const bulkShareBtn = document.getElementById('bulk-share-btn');
    if (bulkShareBtn) {
        bulkShareBtn.addEventListener('click', () => {
            if (selectedQuizIds.length === 0) {
                if (typeof showToast === 'function') showToast('Vui lòng chọn ít nhất một bộ đề để chia sẻ!', 'warning');
                else alert('Vui lòng chọn ít nhất một bộ đề để chia sẻ!');
                return;
            }
            
            let textToShare = 'Danh sách bộ đề được chia sẻ:\n';
            selectedQuizIds.forEach(id => {
                const quiz = userQuizSets.find(q => q.id === id);
                if (quiz) {
                    textToShare += `- ${quiz.title}: ${window.location.origin}/quiz.html?id=${id}\n`;
                }
            });

            if (navigator.share) {
                navigator.share({
                    title: 'Chia sẻ nhiều bộ đề',
                    text: textToShare
                }).then(() => {
                    if (typeof showToast === 'function') showToast('Đã chia sẻ thành công!', 'success');
                }).catch(() => {
                    navigator.clipboard.writeText(textToShare);
                    if (typeof showToast === 'function') showToast('Đã copy danh sách link bộ đề vào Clipboard!', 'success');
                    else alert('Đã copy danh sách link bộ đề!');
                });
            } else {
                navigator.clipboard.writeText(textToShare);
                if (typeof showToast === 'function') showToast('Đã copy danh sách link bộ đề vào Clipboard!', 'success');
                else alert('Đã copy danh sách link bộ đề!');
            }
        });
    }

    const bulkMoveBtn = document.getElementById('bulk-move-btn');
    if (bulkMoveBtn) {
        bulkMoveBtn.addEventListener('click', () => {
            if (selectedQuizIds.length === 0) {
                if (typeof showToast === 'function') showToast('Vui lòng chọn ít nhất một bộ đề để di chuyển!', 'warning');
                else alert('Vui lòng chọn ít nhất một bộ đề để di chuyển!');
                return;
            }
            isBulkMoving = true;
            openMoveQuizModal(selectedQuizIds[0]);
        });
    }

    const folderNameInput = document.getElementById('folderNameInput');
    if (folderNameInput) {
        folderNameInput.addEventListener('input', function() {
            this.classList.remove('border-red-400');
        });
    }

    // Sự kiện chọn icon trong Modal
    document.querySelectorAll('.icon-option').forEach(btn => {
        btn.addEventListener('click', function() {
            selectedFolderIcon = this.getAttribute('data-icon') || 'fa-folder';
            updateFolderModalPickers();
        });
    });

    // Sự kiện chọn màu trong Modal
    document.querySelectorAll('.color-option').forEach(btn => {
        btn.addEventListener('click', function() {
            selectedFolderColor = this.getAttribute('data-color') || 'amber';
            updateFolderModalPickers();
        });
    });

    // Sự kiện chọn màu tùy chỉnh
    const folderColorInput = document.getElementById('folderColorInput');
    if (folderColorInput) {
        folderColorInput.addEventListener('input', function() {
            selectedFolderColor = this.value;
            const textSpan = document.getElementById('folderColorText');
            if (textSpan) textSpan.textContent = this.value.toUpperCase();
            updateFolderModalPickers();
        });
    }

    // Sự kiện nhập icon tùy chọn
    const folderIconInput = document.getElementById('folderIconInput');
    if (folderIconInput) {
        folderIconInput.addEventListener('input', function() {
            let val = this.value.trim();
            if (val) {
                if (!val.startsWith('fa-') && !val.includes(' ')) {
                    val = 'fa-' + val;
                }
                selectedFolderIcon = val;
            } else {
                selectedFolderIcon = 'fa-folder';
            }
            updateFolderModalPickers();
        });
    }

    // Đóng các menu folder/quiz khi click ngoài
    document.body.addEventListener('click', (e) => {
        if (e.target.closest('.quiz-menu') || e.target.closest('.folder-menu') || e.target.closest('.quiz-menu-btn') || e.target.closest('.folder-menu-btn')) return;
        document.querySelectorAll('.quiz-menu, .folder-menu').forEach(menu => menu.classList.add('hidden'));
    });
}

// === CÁC HÀM NGHIỆP VỤ THƯ MỤC ===
function renderBreadcrumb() {
    const breadcrumb = document.getElementById('folder-breadcrumb');
    if (!breadcrumb) return;
    
    if (currentFolderId === null) {
        breadcrumb.innerHTML = `<span class="font-semibold text-pink-500"><i class="fas fa-home mr-1"></i>Thư viện gốc</span>`;
    } else {
        const currentFolder = userFolders.find(f => f.id === currentFolderId);
        const folderName = currentFolder ? currentFolder.name : 'Thư mục không tên';
        const iconClass = currentFolder && currentFolder.icon ? currentFolder.icon : 'fa-folder';
        const colorName = currentFolder && currentFolder.color ? currentFolder.color : 'amber';
        
        let breadcrumbItemHTML = '';
        if (colorName.startsWith('#')) {
            breadcrumbItemHTML = `<span class="font-semibold" style="color: ${colorName};"><i class="fas ${iconClass} mr-1"></i>${folderName}</span>`;
        } else {
            const textColors = {
                amber: 'text-amber-600',
                pink: 'text-pink-600',
                blue: 'text-blue-600',
                green: 'text-green-600',
                purple: 'text-purple-600',
                red: 'text-red-600',
                indigo: 'text-indigo-600'
            };
            const textClass = textColors[colorName] || 'text-amber-600';
            breadcrumbItemHTML = `<span class="font-semibold ${textClass}"><i class="fas ${iconClass} mr-1"></i>${folderName}</span>`;
        }

        breadcrumb.innerHTML = `
            <span class="cursor-pointer hover:text-pink-500 transition" id="breadcrumb-root-btn"><i class="fas fa-home mr-1"></i>Thư viện gốc</span>
            <i class="fas fa-chevron-right text-xs text-gray-300 mx-1"></i>
            ${breadcrumbItemHTML}
        `;
        const rootBtn = document.getElementById('breadcrumb-root-btn');
        if (rootBtn) {
            rootBtn.addEventListener('click', () => {
                currentFolderId = null;
                renderBreadcrumb();
                renderLibrary(userQuizSets);
            });
        }
    }
}

let folderModalMode = 'create'; // 'create' hoặc 'edit'
let activeFolderId = null;

function openFolderModal(mode, folderId = null, folderName = '') {
    folderModalMode = mode;
    activeFolderId = folderId;
    const modal = document.getElementById('folderModal');
    const title = document.getElementById('folderModalTitle');
    const input = document.getElementById('folderNameInput');
    if (!modal || !title || !input) return;

    if (mode === 'create') {
        title.innerHTML = '<i class="fas fa-folder-plus"></i> Tạo thư mục mới';
        input.value = '';
        selectedFolderIcon = 'fa-folder';
        selectedFolderColor = 'amber';
    } else {
        title.innerHTML = '<i class="fas fa-edit"></i> Đổi tên & Cấu hình thư mục';
        input.value = folderName;
        const folder = userFolders.find(f => f.id === folderId);
        selectedFolderIcon = folder && folder.icon ? folder.icon : 'fa-folder';
        selectedFolderColor = folder && folder.color ? folder.color : 'amber';
    }
    
    updateFolderModalPickers();
    modal.classList.remove('hidden');
    input.focus();
}

function updateFolderModalPickers() {
    // 1. Đồng bộ hóa Icon Picker
    let isStaticIcon = false;
    document.querySelectorAll('.icon-option').forEach(btn => {
        const icon = btn.getAttribute('data-icon');
        if (icon === selectedFolderIcon) {
            btn.classList.add('border-pink-500', 'bg-pink-100', 'text-pink-600');
            btn.classList.remove('border-transparent', 'text-gray-600');
            isStaticIcon = true;
        } else {
            btn.classList.remove('border-pink-500', 'bg-pink-100', 'text-pink-600');
            btn.classList.add('border-transparent', 'text-gray-600');
        }
    });

    const folderIconInput = document.getElementById('folderIconInput');
    if (folderIconInput) {
        if (isStaticIcon) {
            if (document.activeElement !== folderIconInput) {
                folderIconInput.value = '';
            }
        } else {
            if (document.activeElement !== folderIconInput) {
                folderIconInput.value = selectedFolderIcon;
            }
        }
    }

    // 2. Đồng bộ hóa Color Picker
    const folderColorInput = document.getElementById('folderColorInput');
    const folderColorText = document.getElementById('folderColorText');

    let isStaticColor = false;
    document.querySelectorAll('.color-option').forEach(btn => {
        const color = btn.getAttribute('data-color');
        if (color === selectedFolderColor) {
            btn.classList.add('ring-4', 'ring-pink-300', 'border-white');
            isStaticColor = true;
        } else {
            btn.classList.remove('ring-4', 'ring-pink-300', 'border-white');
        }
    });

    if (isStaticColor) {
        const hex = STATIC_COLOR_HEX[selectedFolderColor] || '#f59e0b';
        if (folderColorInput) folderColorInput.value = hex;
        if (folderColorText) folderColorText.textContent = hex.toUpperCase();
    } else {
        if (folderColorInput && selectedFolderColor.startsWith('#')) {
            folderColorInput.value = selectedFolderColor;
        }
        if (folderColorText && selectedFolderColor.startsWith('#')) {
            folderColorText.textContent = selectedFolderColor.toUpperCase();
        }
    }
}

function closeFolderModal() {
    const modal = document.getElementById('folderModal');
    if (modal) modal.classList.add('hidden');
}

let activeQuizIdToMove = null;
function openMoveQuizModal(quizId) {
    activeQuizIdToMove = quizId;
    const modal = document.getElementById('moveQuizModal');
    const container = document.getElementById('folder-list-choices');
    if (!modal || !container) return;

    container.innerHTML = '';

    // Thêm tùy chọn thư mục gốc
    const rootItem = document.createElement('label');
    rootItem.className = 'flex items-center gap-3 bg-white p-3 rounded-lg border border-pink-100 cursor-pointer hover:bg-pink-50 transition';
    rootItem.innerHTML = `
        <input type="radio" name="move-folder-choice" value="root" class="form-radio text-pink-500" checked />
        <span class="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <i class="fas fa-home text-pink-400"></i> Thư viện gốc (Không thư mục)
        </span>
    `;
    container.appendChild(rootItem);

    // Thêm các thư mục hiện có
    userFolders.forEach(folder => {
        const item = document.createElement('label');
        item.className = 'flex items-center gap-3 bg-white p-3 rounded-lg border border-pink-100 cursor-pointer hover:bg-pink-50 transition';
        const iconClass = folder.icon || 'fa-folder';
        
        let iconHTML = '';
        if (folder.color && folder.color.startsWith('#')) {
            iconHTML = `<i class="fas ${iconClass}" style="color: ${folder.color};"></i>`;
        } else {
            const textColors = {
                amber: 'text-amber-600',
                pink: 'text-pink-600',
                blue: 'text-blue-600',
                green: 'text-green-600',
                purple: 'text-purple-600',
                red: 'text-red-600',
                indigo: 'text-indigo-600'
            };
            const textClass = textColors[folder.color] || 'text-amber-600';
            iconHTML = `<i class="fas ${iconClass} ${textClass}"></i>`;
        }
        
        item.innerHTML = `
            <input type="radio" name="move-folder-choice" value="${folder.id}" class="form-radio text-pink-500" />
            <span class="text-sm font-semibold text-gray-700 flex items-center gap-2">
                ${iconHTML} ${folder.name}
            </span>
        `;
        container.appendChild(item);
    });

    modal.classList.remove('hidden');
}

function closeMoveQuizModal() {
    const modal = document.getElementById('moveQuizModal');
    if (modal) modal.classList.add('hidden');
}

async function saveFolder() {
    const user = auth.currentUser;
    const input = document.getElementById('folderNameInput');
    if (!user || !input) return;

    const folderName = input.value.trim();
    if (!folderName) {
        input.classList.add('border-red-400');
        return;
    }

    try {
        const localFoldersKey = `quiz_folders_${user.uid}`;
        let folders = JSON.parse(localStorage.getItem(localFoldersKey) || '[]');

        if (folderModalMode === 'create') {
            folders.push({
                id: 'folder_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                name: folderName,
                color: selectedFolderColor,
                icon: selectedFolderIcon,
                createdAt: new Date().toISOString()
            });
            if (typeof showToast === 'function') showToast('Đã tạo thư mục!', 'success');
        } else {
            const folder = folders.find(f => f.id === activeFolderId);
            if (folder) {
                folder.name = folderName;
                folder.color = selectedFolderColor;
                folder.icon = selectedFolderIcon;
            }
            if (typeof showToast === 'function') showToast('Đã cập nhật thư mục!', 'success');
        }

        localStorage.setItem(localFoldersKey, JSON.stringify(folders));
        closeFolderModal();
        await loadAndDisplayLibrary();
    } catch (err) {
        console.error("Lỗi lưu thư mục:", err);
        alert("Có lỗi xảy ra khi lưu thư mục: " + err.message);
    }
}

function updateBulkActionsToolbar() {
    const toolbar = document.getElementById('bulk-actions-toolbar');
    const countSpan = document.getElementById('bulk-select-count');
    if (!toolbar || !countSpan) return;

    if (isSelectionMode) {
        countSpan.innerHTML = `<i class="fas fa-check-square mr-1.5"></i> Đã chọn: <strong>${selectedQuizIds.length}</strong> bộ đề`;
        toolbar.classList.remove('translate-y-28', 'opacity-0', 'pointer-events-none');
        toolbar.classList.add('translate-y-0', 'opacity-100');
    } else {
        toolbar.classList.remove('translate-y-0', 'opacity-100');
        toolbar.classList.add('translate-y-28', 'opacity-0', 'pointer-events-none');
    }
}

function exitSelectionMode() {
    isSelectionMode = false;
    selectedQuizIds = [];
    isBulkMoving = false;
    updateBulkActionsToolbar();
    
    const toggleBtn = document.getElementById('bulk-select-toggle-btn');
    if (toggleBtn) {
        toggleBtn.classList.remove('bg-pink-100', 'text-pink-700', 'border-pink-300');
        toggleBtn.classList.add('bg-gray-100', 'text-gray-700');
        toggleBtn.innerHTML = '<i class="fas fa-tasks"></i> Chọn nhiều';
    }
    
    // Tải lại thư viện để khôi phục card về dạng bình thường
    loadAndDisplayLibrary();
}

async function confirmDeleteFolder(folderId) {
    const user = auth.currentUser;
    if (!user) return;
    if (!confirm("Bạn có chắc chắn muốn xóa thư mục này? Các bộ đề bên trong sẽ được chuyển về thư mục gốc (không bị xóa).")) return;
    
    try {
        const localFoldersKey = `quiz_folders_${user.uid}`;
        let folders = JSON.parse(localStorage.getItem(localFoldersKey) || '[]');
        folders = folders.filter(f => f.id !== folderId);
        localStorage.setItem(localFoldersKey, JSON.stringify(folders));

        // Đưa các bộ đề trong thư mục này về Root trên Firestore (không bị xóa)
        const quizzesToUpdate = userQuizSets.filter(q => q.folderId === folderId);
        for (const quiz of quizzesToUpdate) {
            const quizDocRef = doc(db, "quiz_sets", quiz.id);
            await updateDoc(quizDocRef, { folderId: null });
        }

        if (typeof showToast === 'function') showToast('Đã xóa thư mục và di chuyển bộ đề về gốc!', 'success');
        
        if (currentFolderId === folderId) {
            currentFolderId = null;
        }
        await loadAndDisplayLibrary();
    } catch (err) {
        console.error("Lỗi xóa thư mục:", err);
        alert("Có lỗi xảy ra khi xóa thư mục: " + err.message);
    }
}

async function confirmMoveQuiz() {
    const selectedRadio = document.querySelector('input[name="move-folder-choice"]:checked');
    if (!selectedRadio) return;

    let folderId = selectedRadio.value;
    if (folderId === 'root') folderId = null;

    try {
        if (isBulkMoving) {
            await Promise.all(selectedQuizIds.map(id => {
                const quizDocRef = doc(db, "quiz_sets", id);
                return updateDoc(quizDocRef, { folderId: folderId });
            }));
            if (typeof showToast === 'function') showToast(`Đã di chuyển ${selectedQuizIds.length} bộ đề!`, 'success');
            closeMoveQuizModal();
            exitSelectionMode();
        } else {
            if (!activeQuizIdToMove) return;
            const quizDocRef = doc(db, "quiz_sets", activeQuizIdToMove);
            await updateDoc(quizDocRef, { folderId: folderId });
            if (typeof showToast === 'function') showToast('Đã di chuyển bộ đề!', 'success');
            closeMoveQuizModal();
            await loadAndDisplayLibrary();
        }
    } catch (err) {
        console.error("Lỗi di chuyển bộ đề:", err);
        alert("Có lỗi xảy ra khi di chuyển bộ đề!");
    }
}

// === KHỞI CHẠY ỨNG DỤNG ===
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    showContent('dashboardContent', 'Trang chủ');
});
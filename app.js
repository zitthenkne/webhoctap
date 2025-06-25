// File: app.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { doc, setDoc, collection, addDoc, query, where, getDocs, getDoc, orderBy, limit, deleteDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";

// ... (Toàn bộ các hằng số const giữ nguyên như trước)
const menuToggleBtn = document.getElementById('menu-toggle-btn');
const sidebar = document.getElementById('sidebar');
const pageTitle = document.getElementById('pageTitle');
const userMenuButton = document.getElementById('user-menu-button');
const userName = document.getElementById('user-name');
const userAvatar = document.getElementById('user-avatar');
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
const calculateGpaBtn = document.getElementById('calculate-gpa-btn');
const gpaResultArea = document.getElementById('gpa-result-area');
const downloadTemplateBtn = document.getElementById('download-template-btn');


let questions = [];
let currentQuizTitle = '';
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
    pageTitle.textContent = title;
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
}

onAuthStateChanged(auth, user => { if (user) { userName.textContent = user.email.split('@')[0]; userAvatar.src = `https://ui-avatars.com/api/?name=${user.email[0]}&background=FF69B4&color=fff`; userMenuButton.onclick = handleLogout; } else { userName.textContent = 'Khách'; userAvatar.src = `https://ui-avatars.com/api/?name=?&background=D8BFD8&color=fff`; userMenuButton.onclick = toggleAuthModal; } });
async function handleLogout() { if (confirm('Bạn có chắc muốn đăng xuất?')) await signOut(auth); }
function toggleAuthModal() { authModal.classList.toggle('hidden'); }
async function handleLogin() { const email = document.getElementById('emailInput').value; const password = document.getElementById('passwordInput').value; if (!email || !password) return alert('Vui lòng nhập đủ thông tin.'); try { await signInWithEmailAndPassword(auth, email, password); toggleAuthModal(); } catch (error) { alert('Đăng nhập thất bại: ' + error.message); } }
async function handleSignup() { const email = document.getElementById('emailInput').value; const password = document.getElementById('passwordInput').value; if (!email || !password) return alert('Vui lòng nhập đủ thông tin.'); try { const userCredential = await createUserWithEmailAndPassword(auth, email, password); const user = userCredential.user; await setDoc(doc(db, "users", user.uid), { email: user.email, createdAt: new Date() }); alert('Đăng ký thành công!'); toggleAuthModal(); } catch (error) { alert('Đăng ký thất bại: ' + error.message); } }
async function handleFileSelect(e) { const file = e.target.files[0]; if (!file) return; fileNameElem.textContent = file.name; questionCountInfo.textContent = 'Đang phân tích...'; fileInfo.classList.remove('hidden'); processBtn.classList.add('hidden'); saveBtnPreQuiz.classList.add('hidden'); try { const parsedQuestions = await parseFile(file); if (parsedQuestions.length === 0) { questionCountInfo.textContent = 'Lỗi: Không tìm thấy câu hỏi.'; return; } const topics = parsedQuestions.map(q => q.topic); const uniqueTopics = new Set(topics); questions = parsedQuestions; currentQuizTitle = file.name.replace(/\.(xlsx|xls|csv)$/, ''); questionCountInfo.textContent = `✓ Tìm thấy ${questions.length} câu hỏi / ${uniqueTopics.size} chủ đề.`; processBtn.classList.remove('hidden'); saveBtnPreQuiz.classList.remove('hidden'); saveBtnPreQuiz.disabled = false; saveBtnPreQuiz.innerHTML = '<i class="fas fa-save mr-2"></i> Lưu vào thư viện'; } catch (error) { questionCountInfo.textContent = 'Lỗi! Không thể đọc file.'; console.error("Lỗi phân tích file:", error); } }
function parseFile(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = function(e) { try { const data = new Uint8Array(e.target.result); const workbook = XLSX.read(data, { type: 'array' }); const firstSheet = workbook.Sheets[workbook.SheetNames[0]]; const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }); const parsedQuestions = jsonData.slice(1).map(row => { if (!row || !row[0] || String(row[0]).trim() === '') return null; return { question: row[0], answers: [row[1], row[2], row[3], row[4]].filter(ans => ans != null), correctAnswerIndex: parseInt(row[5], 10) - 1, explanation: row[7] || 'Không có giải thích.', topic: row[6] || 'Chung' }; }).filter(q => q !== null); resolve(parsedQuestions); } catch (error) { reject(error); } }; reader.onerror = reject; reader.readAsArrayBuffer(file); }); }
async function saveAndStartQuiz() { const user = auth.currentUser; if (!user) { toggleAuthModal(); return; } if (questions.length === 0) return alert('Không có câu hỏi.'); processBtn.disabled = true; processBtn.innerHTML = 'Đang chuẩn bị...'; try { const docRef = await addDoc(collection(db, "quiz_sets"), { userId: user.uid, title: currentQuizTitle, questionCount: questions.length, questions: questions, createdAt: new Date() }); window.location.href = `quiz.html?id=${docRef.id}`; } catch (e) { alert('Lỗi khi lưu bộ đề.'); processBtn.disabled = false; processBtn.innerHTML = '<i class="fas fa-play-circle mr-2"></i> Bắt đầu'; console.error("Lỗi:", e); } }
async function saveOnly() { const user = auth.currentUser; if (!user) { toggleAuthModal(); return; } if (questions.length === 0) return alert('Không có câu hỏi để lưu.'); saveBtnPreQuiz.disabled = true; saveBtnPreQuiz.innerHTML = 'Đang lưu...'; try { await addDoc(collection(db, "quiz_sets"), { userId: user.uid, title: currentQuizTitle, questionCount: questions.length, questions: questions, createdAt: new Date() }); alert(`Đã lưu "${currentQuizTitle}"!`); saveBtnPreQuiz.innerHTML = '✓ Đã lưu'; } catch (e) { saveBtnPreQuiz.disabled = false; saveBtnPreQuiz.innerHTML = 'Lưu'; alert('Lỗi khi lưu.'); } }
async function loadAndDisplayLibrary() { const user = auth.currentUser; const quizListContainer = document.getElementById('quiz-list-container'); quizListContainer.innerHTML = `<div class="text-gray-500">Đang tải...</div>`; if (!user) { quizListContainer.innerHTML = '<p>Vui lòng <a href="#" id="login-link" class="text-[#FF69B4] underline">đăng nhập</a>.</p>'; document.getElementById('login-link').onclick = (e) => { e.preventDefault(); toggleAuthModal(); }; return; } try { const q = query(collection(db, "quiz_sets"), where("userId", "==", user.uid), orderBy("createdAt", "desc")); const querySnapshot = await getDocs(q); if (querySnapshot.empty) { quizListContainer.innerHTML = '<p class="text-gray-500">Thư viện trống!</p>'; return; } quizListContainer.innerHTML = ''; querySnapshot.forEach((doc) => { const quizSet = doc.data(); const card = document.createElement('div'); card.className = 'bg-white rounded-lg shadow-md p-4 flex flex-col'; card.innerHTML = ` <div class="flex-grow"><h3 class="text-md font-bold text-gray-700">${quizSet.title}</h3><p class="text-sm text-gray-500 mt-2">${quizSet.questionCount} câu hỏi</p><p class="text-xs text-gray-400 mt-1">Lưu ngày: ${new Date(quizSet.createdAt.toDate()).toLocaleDateString()}</div><div class="mt-4 flex flex-col gap-2"><a href="quiz.html?id=${doc.id}" class="w-full text-center px-4 py-2 bg-[#FF69B4] text-white rounded-lg hover:bg-opacity-80 transition text-sm">Bắt đầu</a><div class="flex gap-2"><button data-id="${doc.id}" data-title="${quizSet.title}" class="edit-quiz-btn w-1/2 text-center px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition text-xs">Sửa</button><button data-id="${doc.id}" class="delete-quiz-btn w-1/2 text-center px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition text-xs">Xóa</button></div></div>`; quizListContainer.appendChild(card); }); } catch (e) { console.error("Lỗi tải thư viện: ", e); quizListContainer.innerHTML = '<p class="text-red-500">Lỗi tải thư viện.</p>'; } }
async function editQuizSetTitle(quizId, currentTitle) { const newTitle = prompt("Nhập tên mới cho bộ đề:", currentTitle); if (newTitle && newTitle.trim() !== '') { const docRef = doc(db, "quiz_sets", quizId); await updateDoc(docRef, { title: newTitle.trim() }); loadAndDisplayLibrary(); } }

// CẬP NHẬT: Cải thiện hàm xóa với try-catch
async function deleteQuizSet(quizId) {
    if (confirm("Bạn có chắc muốn xóa bộ đề này? Hành động này không thể hoàn tác.")) {
        try {
            await deleteDoc(doc(db, "quiz_sets", quizId));
            alert("Đã xóa thành công!");
            loadAndDisplayLibrary(); // Tải lại thư viện để cập nhật giao diện
        } catch (e) {
            alert("Xóa thất bại! Lỗi: " + e.message);
            console.error("Lỗi khi xóa bộ đề: ", e);
        }
    }
}

function downloadTemplate() { const sampleData = [ ['Nội dung câu hỏi', 'Đáp án 1', 'Đáp án 2', 'Đáp án 3', 'Đáp án 4', 'Đáp án đúng (Điền số 1,2,3,4)', 'Chủ đề', 'Giải thích'], ['Thủ đô của Việt Nam là gì?', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Hà Nội', 'Hải Phòng', 3, 'Địa lý', 'Hà Nội là thủ đô của nước CHXHCN Việt Nam.'] ]; const worksheet = XLSX.utils.aoa_to_sheet(sampleData); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Zitthenkne Mau"); worksheet['!cols'] = [ {wch: 50}, {wch: 25}, {wch: 25}, {wch: 25}, {wch: 25}, {wch: 30}, {wch: 25}, {wch: 50} ]; XLSX.writeFile(workbook, "Zitthenkne_File_Mau.xlsx"); }
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
        alert('Vui lòng nhập số câu hợp lệ!');
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
        achievementsContainer.innerHTML = '<p class="text-gray-500 col-span-full">Vui lòng đăng nhập để xem thống kê.</p>';
        statsContainer.innerHTML += '<p class="text-gray-500 px-6 pb-6">Vui lòng đăng nhập để xem lịch sử.</p>';
        return;
    }

    try {
        // CẬP NHẬT: Định nghĩa các thành tựu với tên và hình ảnh
        const achievementsList = { 
            'COLLECTOR': { 
                name: 'Nhà Sưu Tầm', 
                img: 'assets/achievement_collector.png' 
            }, 
            'GENIUS': { 
                name: 'Siêu Trí Tuệ', 
                img: 'assets/achievement_genius.png' 
            }, 
            'MARATHONER': { 
                name: 'Marathon-er', 
                img: 'assets/achievement_marathoner.png' 
            } 
        };

        // Tải thành tựu người dùng đã mở khóa
        const achievementsQuery = query(collection(db, "users", user.uid, "achievements"));
        const achievementsSnapshot = await getDocs(achievementsQuery);
        
        // Hiển thị thành tựu
        if (achievementsSnapshot.empty) {
            achievementsContainer.innerHTML = '<p class="text-gray-500 col-span-full">Chưa có thành tựu nào được mở khóa.</p>';
        } else {
            achievementsSnapshot.forEach(doc => {
                const achievementData = achievementsList[doc.id];
                if (achievementData) {
                    const achievementEl = document.createElement('div');
                    // CẬP NHẬT: Tạo HTML để hiển thị hình ảnh và tên thành tựu
                    achievementEl.className = 'flex flex-col items-center gap-2';
                    achievementEl.innerHTML = `
                        <div class="bg-white p-2 rounded-lg shadow-md">
                            <img src="${achievementData.img}" alt="${achievementData.name}" class="w-24 h-24 object-cover rounded-md">
                        </div>
                        <p class="font-semibold text-sm text-gray-700 mt-1">${achievementData.name}</p>
                    `;
                    achievementsContainer.appendChild(achievementEl);
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

function setupEventListeners() {
    closeModalBtn.addEventListener('click', toggleAuthModal);
    loginBtn.addEventListener('click', handleLogin);
    signupBtn.addEventListener('click', handleSignup);
    uploadArea.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);
    processBtn.addEventListener('click', saveAndStartQuiz);
    saveBtnPreQuiz.addEventListener('click', saveOnly);
    menuToggleBtn.addEventListener('click', () => sidebar.classList.toggle('hidden'));
    selectCreateQuizBtn.addEventListener('click', () => showContent('createQuizContent', 'Tạo trắc nghiệm'));
    selectGpaCalculatorBtn.addEventListener('click', () => showContent('gpaCalculatorContent', 'Tính điểm hệ 4'));
    calculateGpaBtn.addEventListener('click', calculateGPA);
    downloadTemplateBtn.addEventListener('click', downloadTemplate);
    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
            const targetId = link.getAttribute('data-target');
            const title = link.querySelector('span').textContent;
            showContent(targetId, title);
        });
    });
    const libraryContainer = document.getElementById('libraryContent');
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
    const refreshLibraryBtn = document.getElementById('refresh-library-btn');
    if(refreshLibraryBtn) refreshLibraryBtn.addEventListener('click', loadAndDisplayLibrary);
    
    // CẬP NHẬT: Gán sự kiện cho nút refresh của trang thống kê
    const refreshStatsBtn = document.getElementById('refresh-stats-btn');
    if(refreshStatsBtn) refreshStatsBtn.addEventListener('click', loadAndDisplayStats);
}

// === KHỞI CHẠY ỨNG DỤNG ===
setupEventListeners();
showContent('dashboardContent', 'Trang chủ');

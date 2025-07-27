// d:/zitthenkne/quiz-page.js
import { db, auth } from './firebase-init.js';
import { doc, getDoc, collection, addDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { checkAndAwardAchievement, achievements } from './achievements.js';
import { showToast } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- Kiểm tra trạng thái quiz trong localStorage ---
    const savedStateStr = localStorage.getItem('quizState');
    let askedToRestore = false;
    if (savedStateStr) {
        try {
            const savedState = JSON.parse(savedStateStr);
            const quizId = (new URLSearchParams(window.location.search)).get('id');
            // Chỉ hỏi tiếp tục nếu trạng thái chưa hoàn thành
            if (savedState.quizId === quizId && savedState.userAnswers && savedState.userAnswers.length === savedState.questionsLength && !savedState.finished) {
                askedToRestore = true;
                setTimeout(() => {
                    if (confirm('Bạn có muốn tiếp tục bài làm trước đó không?')) {
                        // Đợi dữ liệu quiz load xong mới khôi phục
                        const restoreInterval = setInterval(() => {
                            if (originalQuestions && originalQuestions.length === savedState.questionsLength) {
                                clearInterval(restoreInterval);
                                startQuizMode([...originalQuestions], 'normal', savedState);
                            }
                        }, 200);
                    } else {
                        clearQuizState();
                    }
                }, 400);
            }
        } catch (err) { console.warn('Không thể khôi phục trạng thái quiz:', err); }
    }
    // --- Kết thúc kiểm tra trạng thái quiz ---

    // Lấy các phần tử UI cần thiết
    const quizLanding = document.getElementById('quiz-landing');
    const quizContainer = document.getElementById('quiz-container');
    const flashcardContainer = document.getElementById('flashcard-container');
    const quizSection = document.getElementById('quizSection');
    const resultsSection = document.getElementById('resultsSection');
    const startNowBtn = document.getElementById('start-now-btn');
    const startFlashcardBtn = document.getElementById('start-flashcard-btn');
    const submitQuizBtn = document.getElementById('submit-quiz-btn');

    // Thêm xử lý nút xem trước câu hỏi
    const showPreviewBtn = document.getElementById('show-preview-btn');
    const quizPreview = document.getElementById('quiz-preview');
    if (showPreviewBtn && quizPreview) {
        showPreviewBtn.addEventListener('click', () => {
            quizPreview.classList.toggle('hidden');
        });
    }

    // === BIẾN TRẠNG THÁI ===
    let quizData = null;          // Dữ liệu bộ đề từ Firestore
    let questions = [];           // Các câu hỏi cho phiên làm bài hiện tại
    let originalQuestions = [];   // Toàn bộ câu hỏi gốc
    let currentIndex = 0;         // Vị trí câu hỏi hiện tại (CHO QUIZ)
    let userAnswers = [];         // Mảng lưu câu trả lời của người dùng
    let score = 0;                // Điểm số
    let quizStartTime;            // Thời điểm bắt đầu
    let quizTimerInterval;        // Biến cho đồng hồ đếm giờ
    let quizMode = 'normal';      // 'normal' hoặc 'practice'
    let quizOptions = { isTimed: true, showAnswerImmediately: true }; // NEW: To store session options
     // Lưu tất cả câu hỏi với trạng thái _isKnown cho toàn bộ phiên
         // Bộ câu hỏi đang hiển thị (lượt đầu hoặc ôn tập)
                // Các câu hỏi được đánh dấu "chưa thuộc" trong lượt hiện tại
    let markedQuestions = [];

    // Hàm tải dữ liệu bộ đề từ Firestore dựa vào ID trên URL
    async function loadQuizData() {
        const urlParams = new URLSearchParams(window.location.search);
        const quizId = urlParams.get('id');

        if (!quizId) {
            document.body.innerHTML = `<div class="text-center text-red-500">Lỗi: Không tìm thấy ID của bộ đề.</div>`;
            return;
        }

        try {
            const docRef = doc(db, "quiz_sets", quizId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                quizData = docSnap.data();
                originalQuestions = quizData.questions; // Lưu câu hỏi gốc
                loadQuizDetails(); // Cập nhật thông tin trên trang chào mừng
            } else {
                document.getElementById('quiz-title').textContent = "Lỗi";
                document.getElementById('quiz-info').textContent = "Không tìm thấy bộ đề này.";
            }
        } catch (error) {
            console.error("Lỗi tải dữ liệu bộ đề:", error);
            document.getElementById('quiz-title').textContent = "Lỗi";
            document.getElementById('quiz-info').textContent = "Đã xảy ra lỗi khi tải dữ liệu.";
        }
    }

    // Cập nhật thông tin chi tiết trên trang chào mừng
    function loadQuizDetails() {
        const quizTitle = document.getElementById('quiz-title');
        const quizInfo = document.getElementById('quiz-info');
        if (quizData) {
            quizTitle.textContent = quizData.title;
            quizInfo.textContent = `Bộ đề có ${quizData.questionCount} câu hỏi. Sẵn sàng để chinh phục chưa?`;
        }
        // Preview logic handled separately
    }

    // === LOGIC LÀM BÀI KIỂM TRA ===

    // Hiển thị/ẩn nút nộp bài khi bắt đầu/kết thúc bài
    function showSubmitQuizBtn(show) {
        if (submitQuizBtn) submitQuizBtn.classList.toggle('hidden', !show);
    }
    if (submitQuizBtn) {
        submitQuizBtn.addEventListener('click', () => {
            // Kiểm tra còn câu chưa trả lời hoặc đã đánh dấu
            const unanswered = userAnswers.filter(ans => ans == null).length;
            const marked = markedQuestions.length;
            if (unanswered > 0 || marked > 0) {
                if (!confirm(`Bạn còn ${unanswered} câu chưa trả lời${marked > 0 ? ' và ' + marked + ' câu đã đánh dấu' : ''}. Bạn chắc chắn muốn nộp bài?`)) return;
            }
            endQuiz();
            showSubmitQuizBtn(false);
        });
    }
    function startQuizMode(questionsArray, mode = 'normal', restoreState = null) {
        quizMode = mode;
        questions = questionsArray;

        if (!questions || questions.length === 0) {
            quizContainer.innerHTML = `<p class="text-red-500">Lỗi: Không có dữ liệu câu hỏi để bắt đầu.</p>`;
            return;
        }

        if (restoreState) {
            // Khôi phục trạng thái từ localStorage
            currentIndex = restoreState.currentIndex || 0;
            userAnswers = restoreState.userAnswers || new Array(questions.length).fill(null);
            score = restoreState.score || 0;
            markedQuestions = restoreState.markedQuestions || [];
            quizStartTime = restoreState.quizStartTime ? new Date(restoreState.quizStartTime) : new Date();
        } else {
            currentIndex = 0;
            userAnswers = new Array(questions.length).fill(null);
            score = 0;
            quizStartTime = new Date();
            markedQuestions = [];
        }

        if (quizTimerInterval) clearInterval(quizTimerInterval);
        if (quizOptions.isTimed) {
            // Lấy số phút từ quizOptions, chuyển sang giây
            let totalSeconds = 0;
            if (quizOptions.timedMinutes && !isNaN(quizOptions.timedMinutes)) {
                totalSeconds = quizOptions.timedMinutes * 60;
            }
            startTimer(totalSeconds);
        }

        quizLanding.classList.add('hidden');
        quizContainer.classList.remove('hidden');
        quizSection.innerHTML = '';
        resultsSection.innerHTML = '';
        quizSection.classList.remove('hidden');
        resultsSection.classList.add('hidden');

        showQuestion();
        saveQuizState(); // Lưu trạng thái khi bắt đầu
    }

    // === LOGIC LÀM BÀI KIỂM TRA ===
    function renderQuizProgressBar() {
        // Thêm progress bar và navigator vào quizSection
        const answeredCount = userAnswers.filter(a => a !== null).length;
        const total = questions.length;
        const percent = total > 0 ? Math.round((answeredCount / total) * 100) : 0;
        let navHtml = '';
        for (let i = 0; i < total; i++) {
            const isAnswered = userAnswers[i] !== null;
            const isMarked = markedQuestions.includes(i);
            navHtml += `<button class="quiz-nav-btn ${i === currentIndex ? 'bg-[#FF69B4] text-white' : isAnswered ? 'bg-green-100' : 'bg-gray-100'} ${isMarked ? 'border-2 border-yellow-400' : ''} rounded-full w-8 h-8 mx-1 my-1 text-sm font-bold focus:outline-none" data-qidx="${i}" title="Câu ${i+1}${isMarked ? ' (Đánh dấu)' : ''}">${i+1}</button>`;
        }
        return `
            <div class="mb-4">
                <div class="w-full h-3 bg-gray-200 rounded-full overflow-hidden mb-2">
                    <div class="h-full bg-[#FF69B4] transition-all duration-300" style="width:${percent}%"></div>
                </div>
                <div class="flex justify-between items-center text-xs text-gray-600 mb-2">
                    <span>Đã trả lời: ${answeredCount}/${total}</span>
                    <span>Còn lại: ${total - answeredCount}</span>
                </div>
                <div class="flex flex-wrap justify-center">${navHtml}</div>
            </div>
        `;
    }

    function saveQuizState() {
        // Lưu trạng thái quiz vào localStorage
        const state = {
            quizId: (quizData && quizData.id) || (new URLSearchParams(window.location.search)).get('id'),
            currentIndex,
            userAnswers,
            score,
            markedQuestions,
            quizStartTime: quizStartTime ? quizStartTime.toISOString() : null,
            questionsLength: questions.length
        };
        localStorage.setItem('quizState', JSON.stringify(state));
    }

    function clearQuizState() {
        localStorage.removeItem('quizState');
    }

    function showQuestion() {
    // ...
    // Nếu là chế độ không xem đáp án ngay, khi đã chọn đáp án thì chỉ highlight đáp án đã chọn, không hiện đúng/sai
    if (!quizOptions.showAnswerImmediately && userAnswers[currentIndex] !== null) {
        // Lấy các nút đáp án
        const answerBtns = document.querySelectorAll('.answer-btn');
        answerBtns.forEach((btn, idx) => {
            btn.disabled = true;
            if (userAnswers[currentIndex] === idx) {
                btn.classList.add('bg-blue-100', 'border-blue-400');
            }
        });
        // Ẩn giải thích nếu có
        const explanationArea = document.getElementById('explanation-area');
        if (explanationArea) explanationArea.classList.add('hidden');
        // Hiện nút tiếp theo
        const nextBtn = document.getElementById('nextBtn');
        if (nextBtn) nextBtn.classList.remove('hidden');
        return;
    }

        updateProgressBar();
        const question = questions[currentIndex];

        // Safeguard against corrupted or incomplete question data
        if (!question || !question.question) {
            quizSection.innerHTML = `<p class="text-red-500 text-center p-6">Lỗi: Không thể tải dữ liệu câu hỏi. Dữ liệu có thể bị hỏng.</p>`;
            console.error("Invalid question object at index:", currentIndex, questions);
            return;
        }

        // FIX: Handle both 'answers' and legacy 'options' properties for backward compatibility.
        const answerOptions = question.answers || question.options;
        if (!answerOptions || !Array.isArray(answerOptions)) {
            quizSection.innerHTML = `<p class="text-red-500 text-center p-6">Lỗi: Câu hỏi này không có đáp án. Dữ liệu có thể bị hỏng.</p>`;
            console.error("Question object is missing 'answers' or 'options' array:", question);
            return;
        }

        let title = quizMode === 'practice' ? 'Luyện tập lại' : `Câu hỏi ${currentIndex + 1}`;
        saveQuizState(); // Lưu trạng thái mỗi lần chuyển câu
        quizSection.innerHTML = `
        ${renderQuizProgressBar()}
        <div class="bg-white rounded-lg shadow-lg p-6 fade-in">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-bold text-gray-700">${title}</h2>
                
            </div>
            <div class="mb-2 flex flex-wrap items-center gap-2">
                <span class="inline-block px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold border border-blue-200">
                    <i class="fas fa-tag mr-1"></i> Chủ đề: ${question.topic ? question.topic : 'Chung'}
                </span>
                ${question.level && question.level.trim() ? `<span class="inline-block px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-semibold border border-purple-200"><i class="fas fa-layer-group mr-1"></i> Mức độ: ${question.level}</span>` : ''}
                ${question.source && question.source.trim() ? `<span class="inline-block px-3 py-1 rounded-full bg-pink-100 text-pink-700 text-xs font-semibold border border-pink-200"><i class="fas fa-book mr-1"></i> Nguồn: ${question.source}</span>` : ''}
            </div>
            <h3 class="text-2xl font-semibold text-gray-800 my-6 text-center">${question.question}</h3>
            <div id="answers-container" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${answerOptions.map((answer, index) => `
                    <button class="answer-btn p-4 border border-pink-200 rounded-lg text-left hover:bg-[#FFB6C1]/50 hover:border-[#FF69B4] transition text-lg" data-index="${index}">
                        ${answer}
                    </button>
                `).join('')}
            </div>
            <div class="mt-4 flex flex-wrap justify-end gap-2">
                <button id="mark-question-btn" class="px-4 py-2 rounded-lg border border-yellow-400 text-yellow-700 bg-yellow-50 hover:bg-yellow-100 transition flex items-center gap-2">
                    <i class="fas fa-flag"></i> ${markedQuestions.includes(currentIndex) ? 'Bỏ đánh dấu' : 'Đánh dấu câu này'}
                </button>
                <button id="review-marked-btn" class="px-4 py-2 rounded-lg border border-blue-400 text-blue-700 bg-blue-50 hover:bg-blue-100 transition flex items-center gap-2 ${markedQuestions.length === 0 ? 'hidden' : ''}">
                    <i class="fas fa-eye"></i> Xem các câu đã đánh dấu
                </button>
            </div>
            <div id="explanation-area" class="mt-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded hidden">
                <h4 class="font-bold text-yellow-800 text-lg flex items-center gap-2"><i class="fas fa-lightbulb"></i> Giải thích</h4>
                <p class="text-yellow-700 mt-1 text-base">${question.explanation || 'Không có giải thích.'}</p>
                ${question.note && question.note.trim() ? `<div class="mt-3 flex items-start gap-2"><i class="fas fa-sticky-note text-pink-400 mt-1"></i><span class="text-pink-700 text-base"><span class="font-semibold">Ghi chú:</span> ${question.note}</span></div>` : ''}
            </div>
            <div class="mt-8 flex justify-between">
                <button id="prevBtn" class="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition ${currentIndex === 0 || quizMode === 'practice' ? 'invisible' : ''}">
                    Câu trước
                </button>
                <button id="nextBtn" class="px-6 py-2 bg-[#FF69B4] text-white rounded-lg hover:bg-opacity-80 transition hidden">
                    ${currentIndex === questions.length - 1 ? 'Xem kết quả' : 'Câu tiếp'} <i class="fas fa-arrow-right ml-2"></i>
                </button>
            </div>
        </div>
    `;
    // Nếu đã trả lời câu này thì tự động hiển thị đáp án đã chọn, đúng/sai, và giải thích
    const answeredIdx = userAnswers[currentIndex];
    if (answeredIdx !== null && answeredIdx !== undefined) {
        document.querySelectorAll('.answer-btn').forEach((btn, idx) => {
            btn.disabled = true;
            const isCorrectAnswer = (idx === questions[currentIndex].correctAnswerIndex);
            const isSelectedAnswer = (idx === answeredIdx);

            // Đánh dấu đáp án đã chọn
            if (isSelectedAnswer) {
                btn.classList.add('ring-2', 'ring-[#FF69B4]');
            }
            // Highlight đúng/sai
            if (isCorrectAnswer) {
                btn.classList.add('bg-green-200', 'border-green-400', 'text-green-800', 'font-bold', 'hover:bg-green-200', 'hover:border-green-400');
                if (isSelectedAnswer) btn.classList.add('correct-answer-pulse');
            } else if (isSelectedAnswer) {
                btn.classList.add('bg-red-200', 'border-red-400', 'text-red-800', 'wrong-answer-shake', 'hover:bg-red-200', 'hover:border-red-400');
            } else {
                // Với các đáp án còn lại, loại bỏ hiệu ứng hover để tránh gây nhiễu
                btn.classList.remove('hover:bg-[#FFB6C1]/50', 'hover:border-[#FF69B4]');
            }
        });
        // Hiện giải thích
        const explanationArea = document.getElementById('explanation-area');
        if (explanationArea) explanationArea.classList.remove('hidden');
        // Hiện nút tiếp theo
        const nextBtn = document.getElementById('nextBtn');
        if (nextBtn) {
            nextBtn.classList.remove('hidden');
            nextBtn.addEventListener('click', showNextQuestion, { once: true });
        }
    } else {
        // Nếu chưa trả lời thì gắn sự kiện click như cũ
        document.querySelectorAll('.answer-btn').forEach(button => {
            button.addEventListener('click', handleAnswerClick);
        });
    }
    if (quizMode === 'normal' && currentIndex > 0) {
        document.getElementById('prevBtn').addEventListener('click', showPreviousQuestion);
    }
    // Đánh dấu câu hỏi
    document.getElementById('mark-question-btn').addEventListener('click', () => {
        if (markedQuestions.includes(currentIndex)) {
            markedQuestions = markedQuestions.filter(i => i !== currentIndex);
        } else {
            markedQuestions.push(currentIndex);
        }
        showQuestion();
    });
    // Navigator chuyển nhanh câu hỏi
    document.querySelectorAll('.quiz-nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.getAttribute('data-qidx'));
            if (!isNaN(idx)) {
                currentIndex = idx;
                showQuestion();
            }
        });
    });
    // Xem lại các câu đã đánh dấu
    const reviewMarkedBtn = document.getElementById('review-marked-btn');
    if (reviewMarkedBtn) {
        reviewMarkedBtn.addEventListener('click', () => {
            if (markedQuestions.length > 0) {
                currentIndex = markedQuestions[0];
                showQuestion();
            }
        });
    }
}

// === CHUYỂN VỀ CÂU HỎI TRƯỚC ===
function showPreviousQuestion() {
    if (currentIndex > 0) {
        currentIndex--;
        showQuestion();
    }
}

// === KẾT THÚC BÀI KIỂM TRA ===
function endQuiz() {
    showSubmitQuizBtn(false); // Ẩn nút nộp bài khi kết thúc

    // Nếu là chế độ không xem đáp án ngay, sau khi kết thúc mới tính điểm và hiện đúng/sai cho từng đáp án
    if (!quizOptions.showAnswerImmediately) {
        score = 0;
        for (let i = 0; i < questions.length; i++) {
            if (userAnswers[i] === questions[i].correctAnswerIndex) score++;
        }
    }

    // Đánh dấu đã hoàn thành vào localStorage để không hỏi popup nữa
    try {
        const savedStateStr = localStorage.getItem('quizState');
        if (savedStateStr) {
            const savedState = JSON.parse(savedStateStr);
            savedState.finished = true;
            localStorage.setItem('quizState', JSON.stringify(savedState));
        }
    } catch (e) {}

    // Tính thời gian làm bài
    let totalTime = 0;
    if (quizStartTime) {
        totalTime = Math.floor((new Date() - quizStartTime) / 1000);
    }
    // Dừng timer
    if (quizTimerInterval) clearInterval(quizTimerInterval);
    // Hiện kết quả
    showResults(totalTime);
    // Lưu kết quả nếu là chế độ thường
    if (quizMode === 'normal') {
        const percentage = questions.length > 0 ? (score / questions.length) * 100 : 0;
        saveQuizResult(score, questions.length, percentage, totalTime);
    }
    // Ẩn phần quiz, hiện phần kết quả
    quizSection.classList.add('hidden');
    resultsSection.classList.remove('hidden');
}

// Xác nhận khi nộp bài nếu còn câu chưa trả lời hoặc còn câu đã đánh dấu
function showNextQuestion() {
    if (currentIndex < questions.length - 1) {
        currentIndex++;
        showQuestion();
    } else {
        const unanswered = userAnswers.filter(a => a === null).length;
        if (unanswered > 0 || markedQuestions.length > 0) {
            if (!confirm(`Bạn còn ${unanswered} câu chưa trả lời và ${markedQuestions.length} câu đã đánh dấu. Bạn chắc chắn muốn nộp bài?`)) {
                return;
            }
        }
        endQuiz();
    }
}

// Hiển thị danh sách các câu đã đánh dấu/câu chưa trả lời ở cuối bài
function showResults(totalTime) {
    resultsSection.classList.remove('hidden');
    const percentage = questions.length > 0 ? ((score / questions.length) * 100).toFixed(1) : 0;
    // --- TÍNH ĐIỂM HỆ 4 ---
    const gpaResult = convertScoreToGPA(score, questions.length);
    const gpa4 = gpaResult.score4;
    const letterGrade = gpaResult.letterGrade;
    const motivation = gpaResult.motivation;
    const score10 = gpaResult.score10; // Nếu muốn hiển thị luôn hệ 10
    const showPracticeButton = score < questions.length;
    const unansweredList = questions.map((q, i) => userAnswers[i] === null ? i+1 : null).filter(x => x !== null);
    const markedList = markedQuestions.map(i => i+1);

    const detailedResultsHtml = questions.map((q, index) => {
        const userAnswerIndex = userAnswers[index];
        const isCorrect = userAnswerIndex === q.correctAnswerIndex;

        // FIX: Handle both 'answers' and legacy 'options' properties for backward compatibility.
        const answerOptions = q.answers || q.options;
        if (!answerOptions || !Array.isArray(answerOptions)) {
            return `<div class="mb-8 p-6 rounded-lg bg-red-50 border border-red-200">
                        <h4 class="text-lg font-semibold text-gray-800">Câu ${index + 1}: ${q.question || 'Câu hỏi bị lỗi'}</h4>
                        <p class="text-red-600 mt-2">Lỗi: Không thể hiển thị chi tiết do dữ liệu đáp án bị lỗi.</p>
                    </div>`;
        }

        const userAnswerText = userAnswerIndex !== null ? answerOptions[userAnswerIndex] : 'Chưa trả lời';
        const correctAnswerText = answerOptions[q.correctAnswerIndex];

        return `
            <div class="mb-8 p-6 rounded-lg ${isCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}">
                <div class="flex items-center mb-3">
                    ${isCorrect ? 
                        '<i class="fas fa-check-circle text-green-500 text-xl mr-3"></i>' : 
                        '<i class="fas fa-times-circle text-red-500 text-xl mr-3"></i>'
                    }
                    <h4 class="text-lg font-semibold text-gray-800">Câu ${index + 1}: ${q.question}</h4>
                </div>
                <div class="ml-8">
                    <p class="text-gray-700 mb-2">
                        <span class="font-medium">Câu trả lời của bạn:</span> 
                        <span class="${isCorrect ? 'text-green-600' : 'text-red-600'}">${userAnswerText}</span>
                        ${!isCorrect && userAnswerIndex !== null ? `<i class="fas fa-times ml-1"></i>` : ''}
                    </p>
                    <p class="text-gray-700 mb-2">
                        <span class="font-medium">Đáp án đúng:</span> 
                        <span class="text-green-600">${correctAnswerText}</span> <i class="fas fa-check ml-1"></i>
                    </p>
                    <div class="mt-4 p-3 bg-gray-100 rounded-md">
                        <h5 class="font-bold text-gray-800">Giải thích:</h5>
                        <p class="text-gray-700">${q.explanation || 'Không có giải thích.'}</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    resultsSection.innerHTML = `
        <div class="bg-gradient-to-br from-pink-100 via-white to-pink-200 rounded-2xl shadow-2xl p-10 text-center fade-in animate__animated animate__bounceIn">
            <div class="flex flex-col items-center justify-center mb-6">
                <div class="w-24 h-24 rounded-full bg-[#FF69B4]/10 flex items-center justify-center shadow-lg mb-2 animate__animated animate__tada">
                    <i class="fas fa-crown text-5xl text-[#FF69B4] animate__animated animate__heartBeat"></i>
                </div>
                <h2 class="text-4xl font-extrabold text-[#FF69B4] drop-shadow mb-2">Hoàn thành!</h2>
                <p class="text-gray-600">Đây là kết quả của bạn:</p>
            </div>
            <div class="my-8">
                <p class="text-6xl font-extrabold text-[#FF69B4] animate__animated animate__pulse animate__infinite">
                    ${percentage}%
                </p>
                <p class="text-lg text-gray-700 mt-2">Đúng ${score}/${questions.length} câu</p>
                <div class="flex flex-wrap justify-center gap-4 mt-4">
                  <div class="bg-white/80 px-6 py-3 rounded-xl shadow text-center">
                    <div class="text-gray-600 text-sm font-medium">Điểm hệ 4</div>
                    <div class="text-3xl font-bold text-blue-500">${gpa4}</div>
                  </div>
                  <div class="bg-white/80 px-6 py-3 rounded-xl shadow text-center">
                    <div class="text-gray-600 text-sm font-medium">Điểm chữ</div>
                    <div class="text-2xl font-bold text-pink-500">${letterGrade}</div>
                  </div>
                  <div class="bg-white/80 px-6 py-3 rounded-xl shadow text-center">
                    <div class="text-gray-600 text-sm font-medium">Điểm hệ 10</div>
                    <div class="text-2xl font-bold text-green-500">${score10}</div>
                  </div>
                </div>
                <div class="mt-3 text-pink-700 font-semibold text-base">${motivation}</div>
                <p class="text-sm text-gray-500 mt-1">Bạn đã trả lời ${questions.length - userAnswers.filter(a => a === null).length} / ${questions.length} câu</p>
            </div>
            <div class="text-md text-gray-500">
                <i class="fas fa-clock mr-2"></i> Thời gian: ${formatTime(totalTime)}
            </div>
            <div class="mt-4 text-left">
                ${unansweredList.length > 0 ? `<div class="mb-2"><span class="font-bold text-red-500">Câu chưa trả lời:</span> ${unansweredList.join(', ')}</div>` : ''}
                ${markedList.length > 0 ? `<div><span class="font-bold text-yellow-600">Câu đã đánh dấu:</span> ${markedList.join(', ')}</div>` : ''}
            </div>
            <div class="mt-8 flex justify-center flex-wrap gap-4">
                <button id="restartQuizBtn" class="px-6 py-3 bg-[#FF69B4] text-white rounded-lg hover:bg-opacity-80 transition shadow-lg">
                    <i class="fas fa-redo mr-2"></i> Làm lại
                </button>
                ${showPracticeButton ? `
                    <button id="practiceIncorrectBtn" class="px-6 py-3 bg-orange-400 text-white rounded-lg hover:bg-orange-500 transition shadow-lg">
                        <i class="fas fa-pencil-alt mr-2"></i> Luyện tập câu sai
                    </button>` : ''}
                <a href="index.html" class="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition shadow-lg">
                    <i class="fas fa-home mr-2"></i> Về trang chủ
                </a>
            </div>
        </div>
        <div class="bg-white rounded-lg shadow-lg p-8 mt-8 fade-in">
            <h3 class="text-2xl font-bold text-[#FF69B4] mb-6 text-center">Chi tiết kết quả</h3>
            <div id="detailed-results-list">
                ${detailedResultsHtml}
            </div>
        </div>
    `;
    document.getElementById('restartQuizBtn').addEventListener('click', () => {
        clearQuizState(); // Xóa trạng thái khi làm lại
        // Khi làm lại, vẫn tôn trọng các tùy chọn đã chọn ban đầu
        let questionsToRestart = [...originalQuestions];
        const shouldShuffle = document.getElementById('shuffle-questions-checkbox')?.checked || false;
        if (shouldShuffle) {
            for (let i = questionsToRestart.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [questionsToRestart[i], questionsToRestart[j]] = [questionsToRestart[j], questionsToRestart[i]];
            }
        }
        startQuizMode(questionsToRestart, 'normal');
    });
    if (showPracticeButton) {
        document.getElementById('practiceIncorrectBtn').addEventListener('click', startIncorrectPracticeMode);
    }
}

function startIncorrectPracticeMode() {
    const incorrectQuestions = originalQuestions.filter((q, index) => userAnswers[index] !== q.correctAnswerIndex);
    if (incorrectQuestions.length > 0) {
        startQuizMode(incorrectQuestions, 'practice');
    } else {
        showToast("Chúc mừng! Bạn không có câu nào sai.", 'success');
    }
}

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
}

// === HÀM ĐẾM GIỜ CHO QUIZ ===
function startTimer(totalSeconds) {
    if (!totalSeconds) return; // Nếu không truyền thời gian thì không chạy timer
    let elapsed = 0;
    const timerDisplay = document.getElementById('timerDisplay');
    if (!timerDisplay) return;
    timerDisplay.classList.remove('hidden');
    timerDisplay.textContent = formatTime(totalSeconds);
    clearInterval(quizTimerInterval);
    quizTimerInterval = setInterval(() => {
        elapsed++;
        const remaining = totalSeconds - elapsed;
        timerDisplay.textContent = formatTime(remaining);
        if (remaining <= 0) {
            clearInterval(quizTimerInterval);
            showToast('Hết giờ! Bài sẽ được nộp tự động.', 'info');
            setTimeout(() => {
                endQuiz();
            }, 1000);
            return;
        }
        totalSeconds--;
    }, 1000);
}

// === CÁC HÀM TIỆN ÍCH ===

/**
 * Chuyển đổi số câu đúng và tổng số câu thành điểm hệ 10, hệ 4, điểm chữ và thông điệp động lực.
 * @param {number} correct - Số câu đúng
 * @param {number} total - Tổng số câu
 * @returns {object} { score10, score4, letterGrade, motivation }
 */
function convertScoreToGPA(correct, total) {
    if (isNaN(correct) || isNaN(total) || total <= 0 || correct < 0 || correct > total) {
        return {
            score10: 0,
            score4: 0,
            letterGrade: 'F',
            motivation: 'Dữ liệu không hợp lệ.'
        };
    }
    const n = correct / total;
    let score10;
    if (n < 0.5) {
        score10 = (8 * correct) / total;
    } else if (n === 0.5) {
        score10 = 4.0;
    } else if (n > 0.5 && n < 0.6) {
        score10 = 4 + (10 * (correct - 0.5 * total)) / total;
    } else if (n === 0.6) {
        score10 = 5.0;
    } else { // n > 0.6
        score10 = 5 + (12.5 * (correct - 0.6 * total)) / total;
    }
    let score4, letterGrade, motivation;
    if (score10 >= 9.5) {
        score4 = 4.0;
        letterGrade = 'A+';
        motivation = "Ối dồi ôi, trình là j mà là trình ai chấm!!! Anh chỉ biết làm ba mẹ anh tự hào, xây căn nhà thật to ở 1 mình 2 tấm";
    } else if (score10 >= 8.5) {
        score4 = 4.0;
        letterGrade = 'A';
        motivation = "Dỏi dữ dị bà, trộm vía trộm víaaaaaa, xin vía 4.0 <3";
    } else if (score10 >= 8.0) {
        score4 = 3.5;
        letterGrade = 'B+';
        motivation = "gút chóp bây bề";
    } else if (score10 >= 7.0) {
        score4 = 3.0;
        letterGrade = 'B';
        motivation = "Quaooooooo, vá là dỏi òiiiiii";
    } else if (score10 >= 6.5) {
        score4 = 2.5;
        letterGrade = 'C+';
        motivation = "Điểm này là cũng cũng ròi á mom, u so gud babi";
    } else if (score10 >= 5.5) {
        score4 = 2.0;
        letterGrade = 'C';
        motivation = "Cũn cũn ik, cố gắng lên nhennn";
    } else if (score10 >= 5.0) {
        score4 = 1.5;
        letterGrade = 'D+';
        motivation = "Vừa đủ qua. Cần xem lại kiến thức một chút.";
    } else if (score10 >= 4.0) {
        score4 = 1.0;
        letterGrade = 'D';
        motivation = "Qua môn rồi! Chúc mừng nha bàaaaa";
    } else {
        score4 = 0.0;
        letterGrade = 'F';
        motivation = "Hoi mò hoi mò, lần sau sẽ tốt hơn mà!";
    }
    return {
        score10: Number(score10.toFixed(2)),
        score4: Number(score4.toFixed(1)),
        letterGrade,
        motivation
    };
}


async function saveQuizResult(finalScore, totalQuestions, percentage, timeTaken) {
    const user = auth.currentUser;
    if (!user) return; // Không lưu kết quả cho khách

    try {
        await addDoc(collection(db, "quiz_results"), {
            userId: user.uid,
            quizId: new URLSearchParams(window.location.search).get('id'),
            quizTitle: quizData.title, // Use the stored title
            score: finalScore,
            totalQuestions: totalQuestions,
            timeTaken: timeTaken,
            percentage: percentage,
            completedAt: new Date()
        });
        // Kiểm tra thành tựu
        if (percentage === 100) await checkAndAwardAchievement(user.uid, 'GENIUS');
        if (totalQuestions >= 30) await checkAndAwardAchievement(user.uid, 'MARATHONER');
    } catch (error) {
        console.error("Lỗi khi lưu kết quả:", error);
        showToast('Không thể lưu kết quả của bạn.', 'error');
    }
}

function updateProgressBar() {
    const progressFill = document.getElementById('quiz-progress-fill');
    if (progressFill) {
        const progress = questions.length > 0 ? ((currentIndex / questions.length) * 100) : 0;
        progressFill.style.width = `${progress}%`;
    }
}

// === HÀM XỬ LÝ KHI CHỌN ĐÁP ÁN ===
function handleAnswerClick(e) {
    // Nếu đang ở chế độ không xem đáp án ngay, chỉ lưu đáp án, không hiện đúng/sai
    if (!quizOptions.showAnswerImmediately) {
        const selectedBtn = e.currentTarget;
        const selectedIdx = parseInt(selectedBtn.getAttribute('data-index'));
        if (isNaN(selectedIdx)) return;
        if (userAnswers[currentIndex] !== null) return;
        userAnswers[currentIndex] = selectedIdx;
        // Highlight đáp án đã chọn
        selectedBtn.classList.add('bg-blue-100', 'border-blue-400');
        // Disable các nút khác
        const answerBtns = document.querySelectorAll('.answer-btn');
        answerBtns.forEach(btn => btn.disabled = true);
        // Hiện nút tiếp theo
        const nextBtn = document.getElementById('nextBtn');
        if (nextBtn) {
            nextBtn.classList.remove('hidden');
            nextBtn.addEventListener('click', showNextQuestion, { once: true });
        }
        // Không hiện giải thích, không báo đúng/sai
        return;
    }

    const selectedBtn = e.currentTarget;
    const selectedIdx = parseInt(selectedBtn.getAttribute('data-index'));
    if (isNaN(selectedIdx)) return;

    // Nếu đã trả lời rồi thì không cho chọn lại
    if (userAnswers[currentIndex] !== null) return;

    userAnswers[currentIndex] = selectedIdx;
    const isCorrect = selectedIdx === questions[currentIndex].correctAnswerIndex;
    if (isCorrect) {
        score++;
    }

    // Vô hiệu hóa và hiển thị kết quả cho tất cả các nút đáp án
    document.querySelectorAll('.answer-btn').forEach((btn, idx) => {
        btn.disabled = true;
        const isCorrectAnswer = (idx === questions[currentIndex].correctAnswerIndex);
        const isSelectedAnswer = (idx === selectedIdx);

        // Luôn luôn làm nổi bật đáp án đúng bằng màu xanh
        if (isCorrectAnswer) {
            btn.classList.add('bg-green-200', 'border-green-400', 'text-green-800', 'font-bold');
            // Thêm lớp hover để đảm bảo màu không đổi khi di chuột qua, ghi đè lớp hover mặc định
            btn.classList.add('hover:bg-green-200', 'hover:border-green-400');
            // Nếu người dùng chọn đúng, thêm hiệu ứng pulse
            if (isSelectedAnswer) {
                btn.classList.add('correct-answer-pulse');
            }
        } 
        // Nếu người dùng chọn sai, làm nổi bật lựa chọn sai bằng màu đỏ và hiệu ứng rung
        else if (isSelectedAnswer) {
            btn.classList.add('bg-red-200', 'border-red-400', 'text-red-800');
            btn.classList.add('wrong-answer-shake');
            // Thêm lớp hover để đảm bảo màu không đổi khi di chuột qua
            btn.classList.add('hover:bg-red-200', 'hover:border-red-400');
        } else {
            // Với các đáp án còn lại, loại bỏ hiệu ứng hover để tránh gây nhiễu
            btn.classList.remove('hover:bg-[#FFB6C1]/50', 'hover:border-[#FF69B4]');
        }
    });

    // Hiện giải thích
    const explanationArea = document.getElementById('explanation-area');
    if (explanationArea) explanationArea.classList.remove('hidden');

    // Hiện nút tiếp theo
    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn) {
        nextBtn.classList.remove('hidden');
        nextBtn.addEventListener('click', showNextQuestion, { once: true });
    }
}

// Gắn trình xử lý sự kiện cho các nút
startNowBtn.addEventListener('click', () => {
    // Lấy tùy chọn số câu hỏi nếu có
    const enableCountCheckbox = document.getElementById('enable-question-count-checkbox');
    const countInput = document.getElementById('question-count-input');
    let selectedQuestions = [...originalQuestions];
    if (enableCountCheckbox && enableCountCheckbox.checked && countInput) {
        let n = parseInt(countInput.value);
        n = Math.max(1, Math.min(n, originalQuestions.length));
        // Random n câu hỏi
        selectedQuestions = shuffleArray([...originalQuestions]).slice(0, n);
    }
    // Lấy tùy chọn timer
    const timedCheckbox = document.getElementById('timed-mode-checkbox');
    const timedInput = document.getElementById('timed-minutes-input');
    quizOptions.isTimed = timedCheckbox && timedCheckbox.checked;
    quizOptions.timedMinutes = timedInput ? parseInt(timedInput.value) : 0;
    // Lấy tùy chọn hiện đáp án ngay
    const showAnswerCheckbox = document.getElementById('show-answer-immediately-checkbox');
    quizOptions.showAnswerImmediately = showAnswerCheckbox && showAnswerCheckbox.checked;
    showSubmitQuizBtn(true); // Hiện nút nộp bài khi bắt đầu
    startQuizMode(selectedQuestions, 'normal');
});

// Hàm random hoán vị mảng (Fisher-Yates)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

if (startFlashcardBtn) {
    startFlashcardBtn.addEventListener('click', startFlashcardMode);
}

// Tải dữ liệu bộ đề ngay khi trang được tải
loadQuizData();
}); // Đóng document.addEventListener('DOMContentLoaded', ...
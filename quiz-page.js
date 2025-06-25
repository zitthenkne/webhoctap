// d:/zitthenkne/quiz-page.js
import { db, auth } from './firebase-init.js';
import { doc, getDoc, collection, addDoc } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { checkAndAwardAchievement, achievements } from './achievements.js';
import { showToast } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    // Lấy các phần tử UI cần thiết
    const quizLanding = document.getElementById('quiz-landing');
    const quizContainer = document.getElementById('quiz-container');
    const flashcardContainer = document.getElementById('flashcard-container');
    const quizSection = document.getElementById('quizSection');
    const resultsSection = document.getElementById('resultsSection');
    const startNowBtn = document.getElementById('start-now-btn');
    const startFlashcardBtn = document.getElementById('start-flashcard-btn');

    // === BIẾN TRẠNG THÁI ===
    let quizData = null;          // Dữ liệu bộ đề từ Firestore
    let questions = [];           // Các câu hỏi cho phiên làm bài hiện tại
    let originalQuestions = [];   // Toàn bộ câu hỏi gốc
    let currentIndex = 0;         // Vị trí câu hỏi hiện tại
    let userAnswers = [];         // Mảng lưu câu trả lời của người dùng
    let score = 0;                // Điểm số
    let quizStartTime;            // Thời điểm bắt đầu
    let quizTimerInterval;        // Biến cho đồng hồ đếm giờ
    let quizMode = 'normal';      // 'normal' hoặc 'practice'
    
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
        const aiSummary = document.getElementById('ai-summary');

        if (quizData) {
            quizTitle.textContent = quizData.title;
            quizInfo.textContent = `Bộ đề có ${quizData.questionCount} câu hỏi. Sẵn sàng để chinh phục chưa?`;
            const topics = (quizData.questions || []).map(q => q.topic || 'Chung');
            const uniqueTopics = [...new Set(topics)];
            aiSummary.textContent = `Bộ đề này tập trung vào các chủ đề như: ${uniqueTopics.join(', ')}. Chúc bạn học tốt!`;
        }
    }

    // === LOGIC FLASHCARD (ĐÃ NÂNG CẤP) ===
    function startFlashcardMode() {
        if (!quizData || !quizData.questions || quizData.questions.length === 0) {
            flashcardContainer.innerHTML = `<p class="text-red-500">Lỗi: Không có dữ liệu câu hỏi để tạo flashcard.</p>`;
            return;
        }
        quizLanding.classList.add('hidden');
        flashcardContainer.classList.remove('hidden');
        currentIndex = 0;
        renderFlashcards();
    }

    function renderFlashcards() {
        let currentCardIndex = currentIndex;
        flashcardContainer.innerHTML = `
            <div class="flashcard-viewer mx-auto max-w-2xl">
                <div id="flashcard" class="flashcard-scene">
                    <div class="flashcard-inner">
                        <div id="flashcard-front" class="flashcard-face flashcard-front"></div>
                        <div id="flashcard-back" class="flashcard-face flashcard-back"></div>
                    </div>
                </div>
                <div class="flex justify-between items-center mt-6">
                    <button id="prev-card-btn" class="px-4 py-2 bg-[#D8BFD8] text-white rounded-lg hover:bg-opacity-80 transition disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2">
                        <i class="fas fa-arrow-left"></i> Trước
                    </button>
                    <p id="card-progress" class="text-gray-600 font-medium"></p>
                    <button id="next-card-btn" class="px-4 py-2 bg-[#D8BFD8] text-white rounded-lg hover:bg-opacity-80 transition disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2">
                        Sau <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
            </div>
        `;

        const flashcard = document.getElementById('flashcard');
        const prevBtn = document.getElementById('prev-card-btn');
        const nextBtn = document.getElementById('next-card-btn');

        // Sự kiện lật thẻ khi click
        flashcard.addEventListener('click', () => {
            flashcard.querySelector('.flashcard-inner').classList.toggle('is-flipped');
        });

        // Sự kiện cho nút "Sau"
        nextBtn.addEventListener('click', () => {
            if (currentCardIndex < quizData.questions.length - 1) {
                currentCardIndex++;
                showCard(currentCardIndex);
            }
        });

        // Sự kiện cho nút "Trước"
        prevBtn.addEventListener('click', () => {
            if (currentCardIndex > 0) {
                currentCardIndex--;
                showCard(currentCardIndex);
            }
        });

        showCard(currentCardIndex); // Hiển thị thẻ đầu tiên
    }

    function showCard(index) {
        const cardData = quizData.questions[index];
        const front = document.getElementById('flashcard-front');
        const back = document.getElementById('flashcard-back');
        const progress = document.getElementById('card-progress');
        const flashcardInner = document.querySelector('.flashcard-inner');

        flashcardInner.classList.remove('is-flipped'); // Reset trạng thái lật khi chuyển thẻ

        front.innerHTML = `<p class="text-2xl font-semibold">${cardData.question}</p>`;
        
        const correctAnswer = cardData.answers[cardData.correctAnswerIndex];
        back.innerHTML = `
            <h4 class="font-bold text-xl text-green-600 mb-4">Đáp án: ${correctAnswer}</h4>
            <p class="text-gray-700">${cardData.explanation || 'Không có giải thích.'}</p>
        `;

        progress.textContent = `Thẻ ${index + 1} / ${quizData.questions.length}`;

        // Vô hiệu hóa nút nếu ở đầu hoặc cuối danh sách
        document.getElementById('prev-card-btn').disabled = index === 0;
        document.getElementById('next-card-btn').disabled = index === quizData.questions.length - 1;
    }

    // === LOGIC LÀM BÀI KIỂM TRA (GIAO DIỆN CŨ) ===

    function startQuizMode(questionsArray, mode = 'normal') {
        quizMode = mode;
        questions = questionsArray;

        if (!questions || questions.length === 0) {
            quizContainer.innerHTML = `<p class="text-red-500">Lỗi: Không có dữ liệu câu hỏi để bắt đầu.</p>`;
            return;
        }

        currentIndex = 0;
        userAnswers = new Array(questions.length).fill(null);
        score = 0;
        quizStartTime = new Date();
        if (quizTimerInterval) clearInterval(quizTimerInterval);
        startTimer();

        quizLanding.classList.add('hidden');
        quizContainer.classList.remove('hidden');
        quizSection.innerHTML = '';
        resultsSection.innerHTML = '';
        quizSection.classList.remove('hidden');
        resultsSection.classList.add('hidden');

        showQuestion();
    }

    function showQuestion() {
        updateProgressBar();
        const question = questions[currentIndex];
        let title = quizMode === 'practice' ? 'Luyện tập lại' : `Câu hỏi ${currentIndex + 1}`;

        quizSection.innerHTML = `
            <div class="bg-white rounded-lg shadow-lg p-6 fade-in">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold text-gray-700">${title}</h2>
                    <div id="timer" class="text-lg font-semibold text-[#FF69B4]">00:00</div>
                </div>
                <h3 class="text-2xl font-semibold text-gray-800 my-6 text-center">${question.question}</h3>
                <div id="answers-container" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${question.answers.map((answer, index) => `
                        <button class="answer-btn p-4 border border-pink-200 rounded-lg text-left hover:bg-[#FFB6C1]/50 hover:border-[#FF69B4] transition" data-index="${index}">
                            ${answer}
                        </button>
                    `).join('')}
                </div>
                <div id="explanation-area" class="mt-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded hidden">
                    <h4 class="font-bold text-yellow-800">Giải thích</h4>
                    <p class="text-yellow-700 mt-1">${question.explanation || 'Không có giải thích.'}</p>
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

        document.querySelectorAll('.answer-btn').forEach(button => {
            button.addEventListener('click', handleAnswerClick);
        });

        if (quizMode === 'normal' && currentIndex > 0) {
            document.getElementById('prevBtn').addEventListener('click', showPreviousQuestion);
        }
    }

    function handleAnswerClick(event) {
        const selectedButton = event.currentTarget;
        const selectedIndex = parseInt(selectedButton.dataset.index, 10);
        const question = questions[currentIndex];
        const isCorrect = selectedIndex === question.correctAnswerIndex;

        document.querySelectorAll('.answer-btn').forEach((button, index) => {
            button.disabled = true;
            button.classList.remove('hover:bg-[#FFB6C1]/50', 'hover:border-[#FF69B4]');
            if (index === question.correctAnswerIndex) {
                button.classList.add('bg-green-200', 'border-green-500', 'text-green-800', 'font-bold');
                button.innerHTML += ' <i class="fas fa-check"></i>';
            }
        });

        if (!isCorrect) {
            selectedButton.classList.add('bg-red-200', 'border-red-500', 'text-red-800');
            selectedButton.innerHTML += ' <i class="fas fa-times"></i>';
        }

        document.getElementById('explanation-area').classList.remove('hidden');

        if (quizMode === 'practice') {
            if (isCorrect) {
                document.getElementById('nextBtn').classList.remove('hidden');
                document.getElementById('nextBtn').addEventListener('click', showNextQuestion);
            } else {
                const nextButton = document.getElementById('nextBtn');
                nextButton.textContent = 'Thử lại';
                nextButton.classList.remove('hidden', 'bg-[#FF69B4]');
                nextButton.classList.add('bg-yellow-500', 'hover:bg-yellow-600');
                nextButton.onclick = () => showQuestion();
            }
        } else {
            userAnswers[currentIndex] = selectedIndex;
            if (isCorrect) score++;
            document.getElementById('nextBtn').classList.remove('hidden');
            document.getElementById('nextBtn').addEventListener('click', showNextQuestion);
        }
    }

    function showNextQuestion() {
        if (currentIndex < questions.length - 1) {
            currentIndex++;
            showQuestion();
        } else {
            endQuiz();
        }
    }

    function showPreviousQuestion() {
        if (currentIndex > 0) {
            currentIndex--;
            showQuestion();
        }
    }

    function endQuiz() {
        clearInterval(quizTimerInterval);
        const totalTime = Math.floor((new Date() - quizStartTime) / 1000);
        quizSection.innerHTML = '';

        if (quizMode === 'normal') {
            const percentage = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;
            if (auth.currentUser) {
                saveQuizResult(score, questions.length, percentage, totalTime);
            }
            showResults(totalTime);
        } else {
            resultsSection.classList.remove('hidden');
            resultsSection.innerHTML = `
                <div class="bg-white rounded-lg shadow-lg p-8 text-center fade-in">
                    <h2 class="text-3xl font-bold text-[#FF69B4]">Tuyệt vời!</h2>
                    <p class="text-gray-600 mt-2">Bạn đã hoàn thành luyện tập.</p>
                    <div class="mt-8 flex justify-center">
                        <a href="index.html" class="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition">
                            <i class="fas fa-home mr-2"></i> Về trang chủ
                        </a>
                    </div>
                </div>
            `;
        }
    }

    function showResults(totalTime) {
        resultsSection.classList.remove('hidden');
        const percentage = questions.length > 0 ? ((score / questions.length) * 100).toFixed(1) : 0;
        const showPracticeButton = score < questions.length;

        resultsSection.innerHTML = `
            <div class="bg-white rounded-lg shadow-lg p-8 text-center fade-in">
                <h2 class="text-3xl font-bold text-[#FF69B4]">Hoàn thành!</h2>
                <p class="text-gray-600 mt-2">Đây là kết quả của bạn:</p>
                <div class="my-8">
                    <p class="text-5xl font-bold text-[#FF69B4]">${percentage}%</p>
                    <p class="text-lg text-gray-700 mt-2">Đúng ${score}/${questions.length} câu</p>
                </div>
                <div class="text-md text-gray-500">
                    <i class="fas fa-clock mr-2"></i> Thời gian: ${formatTime(totalTime)}
                </div>
                <div class="mt-8 flex justify-center flex-wrap gap-4">
                    <button id="restartQuizBtn" class="px-6 py-3 bg-[#FF69B4] text-white rounded-lg hover:bg-opacity-80 transition">
                        <i class="fas fa-redo mr-2"></i> Làm lại
                    </button>
                    ${showPracticeButton ? `
                        <button id="practiceIncorrectBtn" class="px-6 py-3 bg-orange-400 text-white rounded-lg hover:bg-orange-500 transition">
                            <i class="fas fa-pencil-alt mr-2"></i> Luyện tập câu sai
                        </button>` : ''}
                    <a href="index.html" class="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition">
                        <i class="fas fa-home mr-2"></i> Về trang chủ
                    </a>
                </div>
            </div>
        `;

        document.getElementById('restartQuizBtn').addEventListener('click', () => startQuizMode(originalQuestions, 'normal'));
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

    function startTimer() {
        quizTimerInterval = setInterval(() => {
            const elapsedTime = Math.floor((new Date() - quizStartTime) / 1000);
            const timerInQuiz = document.getElementById('timer');
            if (timerInQuiz) {
                timerInQuiz.textContent = formatTime(elapsedTime);
            }
        }, 1000);
    }

    function formatTime(seconds) {
        const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
        const secs = (seconds % 60).toString().padStart(2, '0');
        return `${mins}:${secs}`;
    }

    // === CÁC HÀM TIỆN ÍCH ===

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

    // Gắn trình xử lý sự kiện cho các nút
    startNowBtn.addEventListener('click', () => startQuizMode(originalQuestions, 'normal'));
    startFlashcardBtn.addEventListener('click', startFlashcardMode);

    // Tải dữ liệu bộ đề ngay khi trang được tải
    loadQuizData();
});
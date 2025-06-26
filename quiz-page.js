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
    let currentIndex = 0;         // Vị trí câu hỏi hiện tại (CHO QUIZ)
    let userAnswers = [];         // Mảng lưu câu trả lời của người dùng
    let score = 0;                // Điểm số
    let quizStartTime;            // Thời điểm bắt đầu
    let quizTimerInterval;        // Biến cho đồng hồ đếm giờ
    let quizMode = 'normal';      // 'normal' hoặc 'practice'
    let _allFlashcardQuestions = []; // Lưu tất cả câu hỏi với trạng thái _isKnown cho toàn bộ phiên
    let flashcardQuestions = [];     // Bộ câu hỏi đang hiển thị (lượt đầu hoặc ôn tập)
    let reviewQueue = [];            // Các câu hỏi được đánh dấu "chưa thuộc" trong lượt hiện tại
    let currentFlashcardIndex = 0;   // Vị trí thẻ hiện tại cho chế độ Flashcard
    
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

    // === LOGIC FLASHCARD (NÂNG CẤP MỚI) ===

    // Bắt đầu chế độ flashcard, có tùy chọn xáo trộn
    function startFlashcardMode(shuffle = false) {
        if (!originalQuestions || originalQuestions.length === 0) {
            flashcardContainer.innerHTML = `<p class="text-red-500 text-center">Lỗi: Không có dữ liệu câu hỏi để tạo flashcard.</p>`;
            return;
        }

        // Initialize _allFlashcardQuestions with _isKnown state
        _allFlashcardQuestions = originalQuestions.map(q => ({ ...q, _isKnown: false }));
        
        // Set the initial set of questions for this pass
        flashcardQuestions = [..._allFlashcardQuestions]; 

        if (shuffle) {
            // Thuật toán xáo trộn Fisher-Yates
            for (let i = flashcardQuestions.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [flashcardQuestions[i], flashcardQuestions[j]] = [flashcardQuestions[j], flashcardQuestions[i]];
            }
            showToast('Đã xáo trộn thứ tự thẻ!', 'info');
        }

        currentFlashcardIndex = 0;
        reviewQueue = []; // Reset review queue for a new session
        flashcardContainer.classList.remove('hidden');
        quizLanding.classList.add('hidden'); // Hide landing page
        renderFlashcards();
        addFlashcardKeyListeners(); // Thêm lắng nghe sự kiện bàn phím
    }

    // Dựng giao diện cho flashcard
    function renderFlashcards() {
        flashcardContainer.innerHTML = `
            <div class="flashcard-viewer mx-auto max-w-2xl">
                <div id="flashcard" class="flashcard-scene" title="Nhấn để lật thẻ (hoặc dùng phím Space)">
                    <div class="flashcard-inner">
                        <div id="flashcard-front" class="flashcard-face flashcard-front"></div>
                        <div id="flashcard-back" class="flashcard-face flashcard-back"></div>
                    </div>
                </div>
                <div class="flex justify-between items-center mt-6">
                    <button id="prev-card-btn" class="px-4 py-2 bg-[#D8BFD8] text-white rounded-lg hover:bg-opacity-80 transition disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2" title="Phím ←">
                        <i class="fas fa-arrow-left"></i> Trước
                    </button>
                    <p id="card-progress" class="text-gray-600 font-medium"></p>
                    <button id="next-card-btn" class="px-4 py-2 bg-[#D8BFD8] text-white rounded-lg hover:bg-opacity-80 transition disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2" title="Phím →">
                        Sau <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
                <div id="mark-buttons" class="mt-4 flex justify-center gap-4 hidden">
                    <button id="mark-known-btn" class="px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 transition flex items-center gap-2" title="Phím Enter">
                        <i class="fas fa-check"></i> Thuộc
                    </button>
                    <button id="mark-unknown-btn" class="px-6 py-3 bg-red-500 text-white rounded-lg hover:bg-red-600 transition flex items-center gap-2" title="Phím U">
                        <i class="fas fa-times"></i> Chưa thuộc
                    </button>
                </div>
                <div class="mt-4 flex justify-center items-center gap-3 text-sm text-gray-500">
                    <kbd class="px-2 py-1 border rounded bg-gray-100">←</kbd> 
                    <kbd class="px-2 py-1 border rounded bg-gray-100">→</kbd> để chuyển, 
                    <kbd class="px-2 py-1 border rounded bg-gray-100">Space</kbd> để lật
                    <span id="mark-keys-hint" class="hidden">, <kbd class="px-2 py-1 border rounded bg-gray-100">Enter</kbd> thuộc, <kbd class="px-2 py-1 border rounded bg-gray-100">U</kbd> chưa thuộc</span>
                </div>
                <div class="mt-8 border-t pt-6 flex justify-center flex-wrap gap-4">
                     <button id="shuffle-cards-btn" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition flex items-center gap-2">
                        <i class="fas fa-random"></i> Xáo trộn
                    </button>
                    <button id="restart-flashcards-btn" class="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition flex items-center gap-2">
                        <i class="fas fa-redo"></i> Học lại lượt này
                    </button>
                    <button id="exit-flashcard-btn" class="px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500 transition flex items-center gap-2">
                        <i class="fas fa-times-circle"></i> Thoát
                    </button>
                </div>
            </div>
        `;
        // Session complete message (hidden by default)
        flashcardContainer.insertAdjacentHTML('beforeend', `
            <div id="flashcard-session-complete" class="hidden mt-8 p-6 bg-blue-100 text-blue-800 rounded-lg text-center">
                <h3 class="text-xl font-bold mb-3">Hoàn thành phiên học Flashcard!</h3>
                <p class="mb-4">Bạn đã ôn tập tất cả các thẻ.</p>
                <div class="flex justify-center gap-4">
                    <button id="restart-all-flashcards-btn" class="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition">
                        <i class="fas fa-redo"></i> Học lại từ đầu
                    </button>
                    <button id="exit-flashcard-final-btn" class="px-4 py-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500 transition">
                        <i class="fas fa-times-circle"></i> Thoát
                    </button>
                </div>
            </div>
        `);

        // Gắn sự kiện cho các nút điều khiển
        document.getElementById('flashcard').addEventListener('click', flipCard);
        document.getElementById('next-card-btn').addEventListener('click', () => moveToNextFlashcard(false)); // Pass false for not marking
        document.getElementById('prev-card-btn').addEventListener('click', showPrevCard);
        document.getElementById('shuffle-cards-btn').addEventListener('click', () => startFlashcardMode(true));
        document.getElementById('restart-flashcards-btn').addEventListener('click', () => startFlashcardMode(false));
        document.getElementById('exit-flashcard-btn').addEventListener('click', exitFlashcardMode);

        // New mark buttons
        document.getElementById('mark-known-btn').addEventListener('click', () => markCard(true));
        document.getElementById('mark-unknown-btn').addEventListener('click', () => markCard(false));
        document.getElementById('restart-all-flashcards-btn').addEventListener('click', () => startFlashcardMode(false));
        document.getElementById('exit-flashcard-final-btn').addEventListener('click', exitFlashcardMode);

        showCard(currentFlashcardIndex); // Hiển thị thẻ đầu tiên
    }

    // Hiển thị nội dung của một thẻ cụ thể
    function showCard(index) {
        const cardData = flashcardQuestions[index];
        const front = document.getElementById('flashcard-front');
        const back = document.getElementById('flashcard-back');
        const progress = document.getElementById('card-progress');
        const flashcardInner = document.querySelector('.flashcard-inner');
        const markButtons = document.getElementById('mark-buttons');
        const markKeysHint = document.getElementById('mark-keys-hint');
        const sessionCompleteMessage = document.getElementById('flashcard-session-complete');

        if (!front || !back || !progress || !flashcardInner || !markButtons || !markKeysHint || !sessionCompleteMessage) return; // Đảm bảo các phần tử tồn tại

        markButtons.classList.add('hidden'); // Hide mark buttons
        markKeysHint.classList.add('hidden'); // Hide mark keys hint

        flashcardInner.classList.remove('is-flipped'); // Reset trạng thái lật khi chuyển thẻ

        front.innerHTML = `<p class="text-2xl font-semibold">${cardData.question}</p>`;
        
        const correctAnswer = cardData.answers[cardData.correctAnswerIndex];
        back.innerHTML = `
            <h4 class="font-bold text-xl text-green-600 mb-4">Đáp án: ${correctAnswer}</h4>
            <p class="text-gray-700">${cardData.explanation || 'Không có giải thích.'}</p>
        `;

        progress.textContent = `Thẻ ${index + 1} / ${flashcardQuestions.length}`;

        // Vô hiệu hóa nút nếu ở đầu hoặc cuối danh sách
        document.getElementById('prev-card-btn').disabled = index === 0;
        document.getElementById('next-card-btn').disabled = index === flashcardQuestions.length - 1;
    }

    // === CÁC HÀM HỖ TRỢ FLASHCARD ===
    let isCardFlipped = false; // Track if the current card is flipped

    // Lật thẻ và hiển thị/ẩn các nút đánh dấu
    function flipCard() {
        const flashcardInner = document.querySelector('.flashcard-inner');
        const markButtons = document.getElementById('mark-buttons');
        const markKeysHint = document.getElementById('mark-keys-hint');

        if (flashcardInner) {
            flashcardInner.classList.toggle('is-flipped');
            isCardFlipped = flashcardInner.classList.contains('is-flipped');

            if (isCardFlipped) {
                markButtons.classList.remove('hidden'); // Show mark buttons
                markKeysHint.classList.remove('hidden'); // Show mark keys hint
                // Disable navigation buttons when flipped, forcing user to mark
                document.getElementById('prev-card-btn').disabled = true;
                document.getElementById('next-card-btn').disabled = true;
            } else {
                markButtons.classList.add('hidden'); // Hide mark buttons
                markKeysHint.classList.add('hidden'); // Hide mark keys hint
                // Re-enable navigation buttons if not flipped
                document.getElementById('prev-card-btn').disabled = currentFlashcardIndex === 0;
                document.getElementById('next-card-btn').disabled = currentFlashcardIndex === flashcardQuestions.length - 1;
            }
        }
    }

    // Đánh dấu thẻ là thuộc/chưa thuộc và chuyển sang thẻ tiếp theo
    function markCard(isKnown) {
        const currentCard = flashcardQuestions[currentFlashcardIndex];
        
        // Find the original question in _allFlashcardQuestions and update its state
        const originalCardIndex = _allFlashcardQuestions.findIndex(q => q.question === currentCard.question && q.correctAnswerIndex === currentCard.correctAnswerIndex);
        if (originalCardIndex !== -1) {
            _allFlashcardQuestions[originalCardIndex]._isKnown = isKnown;
        }

        // Add to reviewQueue if unknown and not already there
        if (!isKnown && !reviewQueue.includes(currentCard)) {
            reviewQueue.push(currentCard);
        }

        moveToNextFlashcard(true); // Marked, so move to next
    }

    // Chuyển đến thẻ flashcard tiếp theo hoặc bắt đầu phiên ôn tập
    function moveToNextFlashcard(marked = false) {
        // If card was flipped and not marked, force marking or flip back
        if (isCardFlipped && !marked) {
            showToast('Vui lòng đánh dấu thẻ này là "Thuộc" hoặc "Chưa thuộc" trước khi chuyển.', 'warning');
            return;
        }

        currentFlashcardIndex++;
        if (currentFlashcardIndex < flashcardQuestions.length) {
            showCard(currentFlashcardIndex);
        } else {
            // End of current pass
            const cardsToReviewNextPass = _allFlashcardQuestions.filter(q => !q._isKnown);

            if (cardsToReviewNextPass.length > 0) {
                showToast(`Bắt đầu ôn tập lại ${cardsToReviewNextPass.length} thẻ chưa thuộc!`, 'info');
                flashcardQuestions = cardsToReviewNextPass;
                currentFlashcardIndex = 0;
                reviewQueue = []; // Clear review queue for the next pass
                showCard(currentFlashcardIndex);
            } else {
                // All cards are now known after review, or no cards left
                endFlashcardSession();
            }
        }
    }

    // Hiển thị thẻ flashcard trước đó
    function showPrevCard() {
        if (currentFlashcardIndex > 0) {
            currentFlashcardIndex--;
            showCard(currentFlashcardIndex);
        }
    }

    // Kết thúc phiên flashcard và hiển thị thông báo hoàn thành
    function endFlashcardSession() {
        const markButtons = document.getElementById('mark-buttons');
        const markKeysHint = document.getElementById('mark-keys-hint');
        const sessionCompleteMessage = document.getElementById('flashcard-session-complete');
        const flashcardScene = document.getElementById('flashcard');
        const navButtons = document.querySelector('.flex.justify-between.items-center.mt-6');
        const controlButtons = document.querySelector('.mt-8.border-t.pt-6');

        if (markButtons) markButtons.classList.add('hidden');
        if (markKeysHint) markKeysHint.classList.add('hidden');
        if (flashcardScene) flashcardScene.classList.add('hidden');
        if (navButtons) navButtons.classList.add('hidden');
        if (controlButtons) controlButtons.classList.add('hidden');

        if (sessionCompleteMessage) sessionCompleteMessage.classList.remove('hidden');
    }

    // Thoát chế độ flashcard
    function exitFlashcardMode() {
        flashcardContainer.classList.add('hidden');
        quizLanding.classList.remove('hidden');
        removeFlashcardKeyListeners(); // Gỡ bỏ lắng nghe sự kiện bàn phím để tránh xung đột
        // Reset all flashcard related states for a clean start next time
        _allFlashcardQuestions = [];
        flashcardQuestions = [];
        currentFlashcardIndex = 0;
        reviewQueue = [];
        isCardFlipped = false;
    }

    // Xử lý sự kiện nhấn phím
    function handleFlashcardKeyPress(e) {
        // Không xử lý nếu đang gõ trong input/textarea
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // If card is flipped, prioritize marking keys
        if (isCardFlipped) {
            switch (e.key) {
                case 'Enter':
                    e.preventDefault(); // Prevent default Enter behavior (e.g., form submission)
                    document.getElementById('mark-known-btn')?.click();
                    break;
                case 'u': // 'U' key for unknown
                case 'U':
                    e.preventDefault();
                    document.getElementById('mark-unknown-btn')?.click();
                    break;
                // Allow space to flip back if needed, but marking is preferred
                case ' ':
                    e.preventDefault();
                    flipCard(); // Allow flipping back
                    break;
            }
        } else { // Card is not flipped, allow navigation and flipping
            switch (e.key) {
                case 'ArrowLeft':
                    document.getElementById('prev-card-btn')?.click();
                    break;
                case 'ArrowRight':
                    document.getElementById('next-card-btn')?.click();
                    break;
                case ' ': // Space to flip
                case 'ArrowUp':
                case 'ArrowDown':
                    e.preventDefault();
                    flipCard();
                    break;
            }
        }
    }

    function addFlashcardKeyListeners() {
        document.addEventListener('keydown', handleFlashcardKeyPress);
    }

    function removeFlashcardKeyListeners() {
        document.removeEventListener('keydown', handleFlashcardKeyPress);
    }

    // === LOGIC LÀM BÀI KIỂM TRA ===

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

        const detailedResultsHtml = questions.map((q, index) => {
            const userAnswerIndex = userAnswers[index];
            const isCorrect = userAnswerIndex === q.correctAnswerIndex;
            const userAnswerText = userAnswerIndex !== null ? q.answers[userAnswerIndex] : 'Chưa trả lời';
            const correctAnswerText = q.answers[q.correctAnswerIndex];

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
            <div class="bg-white rounded-lg shadow-lg p-8 text-center fade-in">
                <h2 class="text-3xl font-bold text-[#FF69B4]">Hoàn thành!</h2>
                <p class="text-gray-600 mt-2">Đây là kết quả của bạn:</p>
                <div class="my-8">
                    <p class="text-5xl font-bold text-[#FF69B4]">${percentage}%</p>
                    <p class="text-lg text-gray-700 mt-2">Đúng ${score}/${questions.length} câu</p>
                    <p class="text-sm text-gray-500 mt-1">Bạn đã trả lời ${questions.length - userAnswers.filter(a => a === null).length} / ${questions.length} câu</p>
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

            <div class="bg-white rounded-lg shadow-lg p-8 mt-8 fade-in">
                <h3 class="text-2xl font-bold text-[#FF69B4] mb-6 text-center">Chi tiết kết quả</h3>
                <div id="detailed-results-list">
                    ${detailedResultsHtml}
                </div>
            </div>
        `;

        document.getElementById('restartQuizBtn').addEventListener('click', () => startQuizMode([...originalQuestions], 'normal'));
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
    startNowBtn.addEventListener('click', () => startQuizMode([...originalQuestions], 'normal'));
    startFlashcardBtn.addEventListener('click', startFlashcardMode);

    // Tải dữ liệu bộ đề ngay khi trang được tải
    loadQuizData();
});
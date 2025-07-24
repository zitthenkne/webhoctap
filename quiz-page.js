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
    let quizOptions = { isTimed: true }; // NEW: To store session options
    let _allFlashcardQuestions = []; // Lưu tất cả câu hỏi với trạng thái _isKnown cho toàn bộ phiên
    let flashcardQuestions = [];     // Bộ câu hỏi đang hiển thị (lượt đầu hoặc ôn tập)
    let reviewQueue = [];            // Các câu hỏi được đánh dấu "chưa thuộc" trong lượt hiện tại
    let currentFlashcardIndex = 0;   // Vị trí thẻ hiện tại cho chế độ Flashcard
    // === NÂNG CẤP CHẾ ĐỘ ĐÁNH ĐỀ ===
    // Thêm biến trạng thái cho đánh dấu câu hỏi
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

    // --- Preview Button Logic ---
    let previewBtn, previewBlock, previewList;
    function setupPreviewButton() {
        previewBtn = document.getElementById('show-preview-btn');
        previewBlock = document.getElementById('quiz-preview');
        previewList = document.getElementById('quiz-preview-list');
        const previewContent = document.getElementById('quiz-preview-content');
        const collapseBtn = document.getElementById('collapse-preview-btn');
        if (previewBtn && previewBlock && previewList && previewContent && collapseBtn) {
            previewBtn.addEventListener('click', () => {
                if (!quizData || !quizData.questions || quizData.questions.length === 0) {
                    previewList.innerHTML = '<li class="quiz-preview-empty">Không có câu hỏi để xem trước.</li>';
                    previewBlock.classList.remove('hidden');
                    previewContent.classList.remove('collapsed');
                    collapseBtn.querySelector('i').classList.remove('fa-rotate-180');
                    return;
                }
                // Randomly pick 5 questions
                let questions = [...quizData.questions];
                for (let i = questions.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [questions[i], questions[j]] = [questions[j], questions[i]];
                }
                const picked = questions.slice(0, 5);
                previewList.innerHTML = '';
                picked.forEach((q) => {
                    let text = q.text || q.question || '';
                    if (text.length > 80) text = text.substring(0, 80) + '...';
                    let answers = q.answers || q.choices || q.options || [];
                    let answersHtml = '';
                    if (Array.isArray(answers) && answers.length > 0) {
                        // Render answers in 2 columns (CSS grid)
                        let answerItems = answers.map(a => `<li class='preview-answer-item'>${a}</li>`).join('');
                        answersHtml = `<ul class='preview-answers preview-answers-2col'>${answerItems}</ul>`;
                    } else {
                        answersHtml = '<div class="preview-no-answers">(Không có đáp án trắc nghiệm)</div>';
                    }
                    previewList.innerHTML += `<li><span class='preview-question-text'>${text}</span>${answersHtml}</li>`;
                });
                previewBlock.classList.remove('hidden');
                previewContent.classList.remove('collapsed');
                collapseBtn.querySelector('i').classList.remove('fa-rotate-180');
            });
            collapseBtn.addEventListener('click', () => {
                previewContent.classList.toggle('collapsed');
                collapseBtn.querySelector('i').classList.toggle('fa-rotate-180');
            });
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        setupPreviewButton();
        // ... (giữ nguyên các logic khác trong DOMContentLoaded)
        // Tải dữ liệu bộ đề ngay khi trang được tải
        loadQuizData();
    });

    // Sau khi loadQuizData xong và quizData đã có, gọi lại setupPreviewButton để đảm bảo quizData đã sẵn sàng
    function loadQuizDetails() {
        const quizTitle = document.getElementById('quiz-title');
        const quizInfo = document.getElementById('quiz-info');
        if (quizData) {
            quizTitle.textContent = quizData.title;
            quizInfo.textContent = `Bộ đề có ${quizData.questionCount} câu hỏi. Sẵn sàng để chinh phục chưa?`;
        }
        setupPreviewButton();
        // Preview logic handled separately
    }

    // === LOGIC FLASHCARD (NÂNG CẤP MỚI) ===

    // Bắt đầu chế độ flashcard, có tùy chọn xáo trộn
    function startFlashcardMode(shuffle = false) {
        if (!originalQuestions || originalQuestions.length === 0) {
            flashcardContainer.innerHTML = `<p class="text-red-500 text-center">Lỗi: Không có dữ liệu câu hỏi để tạo flashcard.</p>`;
            return;
        }
        // Gán _originalIndex để đảm bảo mapping đúng khi shuffle
        _allFlashcardQuestions = originalQuestions.map((q, idx) => ({ ...q, _isKnown: false, _originalIndex: idx }));
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
                <div class="w-full h-3 bg-gray-200 rounded-full overflow-hidden mb-4">
                    <div id="flashcard-progress-bar" class="h-full bg-[#FF69B4] transition-all duration-300" style="width:0%"></div>
                </div>
                <div class="flex justify-between items-center mb-2 text-sm text-gray-600">
                    <span id="flashcard-known-count"></span>
                    <span id="flashcard-unknown-count"></span>
                    <span id="flashcard-progress-percent" class="ml-auto font-bold"></span>
                </div>
                <div id="flashcard" class="flashcard-scene" title="Nhấn để lật thẻ (hoặc dùng phím Space)">
                    <div class="flashcard-inner transition-transform duration-500">
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
                    <button id="random-card-btn" class="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition flex items-center gap-2">
                        <i class="fas fa-dice"></i> Ngẫu nhiên
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
                    <button id="review-unknown-btn" class="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition">
                        <i class="fas fa-undo"></i> Xem lại thẻ chưa thuộc
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

        if (!front || !back || !progress || !flashcardInner || !markButtons || !markKeysHint || !sessionCompleteMessage) return;

        markButtons.classList.add('hidden');
        markKeysHint.classList.add('hidden');
        flashcardInner.classList.remove('is-flipped');

        // Hiển thị câu hỏi
        front.innerHTML = `<p class="text-2xl font-semibold">${cardData.question}</p>`;

        // Ghi chú cá nhân (localStorage)
        const quizId = new URLSearchParams(window.location.search).get('id') || 'default';
        const noteKey = `flashcard_note_${quizId}_${index}`;
        let savedNote = localStorage.getItem(noteKey) || '';

        // Hiển thị đáp án, giải thích, và ô ghi chú
        const answerOptions = cardData.answers || cardData.options;
        if (!answerOptions || cardData.correctAnswerIndex === undefined || cardData.correctAnswerIndex === null) {
            back.innerHTML = `<p class="text-red-500">Lỗi dữ liệu thẻ.</p>`;
            progress.textContent = `Thẻ ${index + 1} / ${flashcardQuestions.length}`;
            return;
        }
        const correctAnswer = answerOptions[cardData.correctAnswerIndex];
        back.innerHTML = `
            <h4 class="font-bold text-xl text-green-600 mb-4">Đáp án: ${correctAnswer || 'N/A'}</h4>
            <p class="text-gray-700 mb-2">${cardData.explanation || 'Không có giải thích.'}</p>
            <textarea id="flashcard-note" class="w-full mt-2 p-2 border rounded bg-pink-50 text-gray-700" rows="2" placeholder="Ghi chú cá nhân...">${savedNote}</textarea>
            <div class="text-xs text-gray-400 mt-1">Ghi chú này chỉ lưu trên thiết bị của bạn.</div>
        `;
        // Lưu ghi chú khi thay đổi
        setTimeout(() => {
            const noteInput = document.getElementById('flashcard-note');
            if (noteInput) {
                noteInput.addEventListener('input', (e) => {
                    localStorage.setItem(noteKey, e.target.value);
                });
            }
        }, 100);

        progress.textContent = `Thẻ ${index + 1} / ${flashcardQuestions.length}`;
        document.getElementById('prev-card-btn').disabled = index === 0;
        document.getElementById('next-card-btn').disabled = index === flashcardQuestions.length - 1;
        updateFlashcardProgress();

        // Hiệu ứng khi lật thẻ và đánh dấu
        setTimeout(() => {
            const markKnownBtn = document.getElementById('mark-known-btn');
            const markUnknownBtn = document.getElementById('mark-unknown-btn');
            const flashcardInner = document.querySelector('.flashcard-inner');
            if (markKnownBtn && flashcardInner) {
                markKnownBtn.addEventListener('click', () => {
                    flashcardInner.classList.add('flash-success');
                    setTimeout(() => flashcardInner.classList.remove('flash-success'), 600);
                });
            }
            if (markUnknownBtn && flashcardInner) {
                markUnknownBtn.addEventListener('click', () => {
                    flashcardInner.classList.add('rumble');
                    setTimeout(() => flashcardInner.classList.remove('rumble'), 400);
                });
            }
            // Gợi ý khi có ghi chú
            const noteInput = document.getElementById('flashcard-note');
            const noteHint = document.getElementById('flashcard-note-hint');
            if (noteInput && noteHint) {
                noteInput.addEventListener('focus', () => {
                    noteHint.textContent = 'Bạn có thể ghi chú mẹo nhớ, ví dụ, hoặc bất cứ điều gì!';
                    noteHint.classList.remove('hidden');
                });
                noteInput.addEventListener('blur', () => {
                    noteHint.classList.add('hidden');
                });
            }
        }, 200);
    }

    // === CÁC HÀM HỖ TRỢ FLASHCARD ===
    let isCardFlipped = false; // Track if the current card is flipped

    // Cập nhật progress bar và bộ đếm known/unknown khi chuyển thẻ
    function updateFlashcardProgress() {
        const progressBar = document.getElementById('flashcard-progress-bar');
        const knownCount = _allFlashcardQuestions.filter(q => q._isKnown).length;
        const unknownCount = _allFlashcardQuestions.length - knownCount;
        const knownSpan = document.getElementById('flashcard-known-count');
        const unknownSpan = document.getElementById('flashcard-unknown-count');
        const percent = _allFlashcardQuestions.length > 0 ? (knownCount / _allFlashcardQuestions.length) * 100 : 0;
        if (progressBar) progressBar.style.width = percent + '%';
        if (knownSpan) knownSpan.textContent = `Đã thuộc: ${knownCount}`;
        if (unknownSpan) unknownSpan.textContent = `Chưa thuộc: ${unknownCount}`;
        const percentSpan = document.getElementById('flashcard-progress-percent');
        if (percentSpan) percentSpan.textContent = `${percent.toFixed(0)}%`;
    }

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
        // Tìm đúng index trong _allFlashcardQuestions bằng cả question và index gốc
        const quizId = new URLSearchParams(window.location.search).get('id') || 'default';
        const originalCardIndex = _allFlashcardQuestions.findIndex((q, idx) => {
            // So sánh cả nội dung và vị trí để tránh trùng lặp
            return q.question === currentCard.question && q.correctAnswerIndex === currentCard.correctAnswerIndex && idx === currentCard._originalIndex;
        });
        if (originalCardIndex !== -1) {
            _allFlashcardQuestions[originalCardIndex]._isKnown = isKnown;
        } else {
            // Nếu không tìm thấy theo index, fallback về so sánh nội dung
            const fallbackIdx = _allFlashcardQuestions.findIndex(q => q.question === currentCard.question && q.correctAnswerIndex === currentCard.correctAnswerIndex);
            if (fallbackIdx !== -1) _allFlashcardQuestions[fallbackIdx]._isKnown = isKnown;
        }

        // Add to reviewQueue if unknown and not already there
        if (!isKnown && !reviewQueue.includes(currentCard)) {
            reviewQueue.push(currentCard);
        }

        updateFlashcardProgress();

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
            startTimer();
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
                <div id="timer" class="text-lg font-semibold text-[#FF69B4] ${quizOptions.isTimed ? '' : 'hidden'}">00:00</div>
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
function startTimer() {
    const timerElement = document.getElementById('timer');
    if (!timerElement) return; // Guard clause if timer is disabled
    let totalSeconds = (quizData && quizData.timeLimit) ? quizData.timeLimit * 60 : 30 * 60; // Mặc định 30 phút nếu không có timeLimit
    let warningShown = false;
    if (quizTimerInterval) clearInterval(quizTimerInterval);
    quizTimerInterval = setInterval(() => {
        if (timerElement) timerElement.textContent = formatTime(totalSeconds);
        if (totalSeconds === 300 && !warningShown) {
            showToast('Chỉ còn 5 phút, hãy kiểm tra lại các câu đã đánh dấu!', 'warning');
            warningShown = true;
        }
        if (totalSeconds <= 0) {
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
    // Get options from checkboxes
    const shouldShuffle = document.getElementById('shuffle-questions-checkbox')?.checked || false;
    const timedCheckbox = document.getElementById('timed-mode-checkbox');
    const isTimed = timedCheckbox ? timedCheckbox.checked : true;

    // Update session options
    quizOptions = { isTimed };

    let questionsToStart = [...originalQuestions]; // Create a copy to avoid modifying the original

    if (shouldShuffle) {
        // Fisher-Yates shuffle
        for (let i = questionsToStart.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [questionsToStart[i], questionsToStart[j]] = [questionsToStart[j], questionsToStart[i]];
        }
        showToast('Đã xáo trộn câu hỏi!', 'info');
    }
    
    startQuizMode(questionsToStart, 'normal');
});
startFlashcardBtn.addEventListener('click', startFlashcardMode);

// Tải dữ liệu bộ đề ngay khi trang được tải
loadQuizData();
});
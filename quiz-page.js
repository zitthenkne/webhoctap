// File: quiz-page.js

import { auth, db } from './firebase-init.js';
import { doc, getDoc, addDoc, collection, setDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";

const quizLanding = document.getElementById('quiz-landing');
const quizContainer = document.getElementById('quiz-container');
const quizTitleElem = document.getElementById('quiz-title');
const quizInfoElem = document.getElementById('quiz-info');
const aiSummaryElem = document.getElementById('ai-summary');
const startNowBtn = document.getElementById('start-now-btn');
let questions = [], currentQuestionIndex = 0, userAnswers = [], score = 0, quizStartTime, quizTimerInterval, originalQuestions = [], quizMode = 'normal', currentQuizTitle = '';
const achievements = { 'COLLECTOR': { name: 'Nhà Sưu Tầm', description: 'Lưu 5 bộ đề.', icon: 'fa-gem' }, 'GENIUS': { name: 'Siêu Trí Tuệ', description: 'Đạt 100% bài kiểm tra.', icon: 'fa-brain' }, 'MARATHONER': { name: 'Marathon-er', description: 'Hoàn thành bài trên 30 câu.', icon: 'fa-running' } };

window.onload = () => { const params = new URLSearchParams(window.location.search); const quizId = params.get('id'); if (quizId) { loadQuizData(quizId); } else { quizTitleElem.textContent = "Lỗi!"; quizInfoElem.textContent = "Không tìm thấy mã bài kiểm tra."; } };
async function loadQuizData(quizId) { try { const docRef = doc(db, "quiz_sets", quizId); const docSnap = await getDoc(docRef); if (docSnap.exists()) { const quizSet = docSnap.data(); originalQuestions = quizSet.questions; currentQuizTitle = quizSet.title; quizTitleElem.textContent = quizSet.title; quizInfoElem.textContent = `Bài kiểm tra này có ${quizSet.questionCount} câu hỏi. Chúc bạn may mắn!`; const summary = getAISummary(quizSet.questions); aiSummaryElem.textContent = summary; startNowBtn.addEventListener('click', () => { quizLanding.classList.add('hidden'); quizContainer.classList.remove('hidden'); startQuiz(originalQuestions, 'normal'); }); } else { quizTitleElem.textContent = "Không tìm thấy bộ đề"; } } catch (e) { console.error("Lỗi tải dữ liệu quiz: ", e); quizTitleElem.textContent = "Đã xảy ra lỗi"; } }
function getAISummary(questions) { if (!questions || questions.length === 0) return "Không có nội dung để tóm tắt."; const topics = questions.map(q => q.topic || 'Chung'); const uniqueTopics = [...new Set(topics)]; const keywords = questions.slice(0, 3).map(q => q.question.split(' ').slice(0, 3).join(' ')); return `Bộ đề này tập trung vào ${uniqueTopics.length} chủ đề chính, bao gồm: ${uniqueTopics.join(', ')}. Một số nội dung đầu tiên đề cập đến "${keywords.join('...", "')}...".`; }
function startQuiz(questionsArray, mode = 'normal') { quizMode = mode; questions = questionsArray; if (quizMode === 'normal') originalQuestions = questionsArray; currentQuestionIndex = 0; userAnswers = new Array(questions.length).fill(null); score = 0; quizStartTime = new Date(); if(quizTimerInterval) clearInterval(quizTimerInterval); startTimer(); const quizSection = document.getElementById('quizSection'); const resultsSection = document.getElementById('resultsSection'); quizSection.innerHTML = ''; resultsSection.innerHTML = ''; quizSection.classList.remove('hidden'); resultsSection.classList.add('hidden'); showQuestion(); }

function showQuestion() {
    const quizSection = document.getElementById('quizSection');
    const question = questions[currentQuestionIndex];
    let title = quizMode === 'practice' ? 'Luyện tập lại' : `Câu hỏi ${currentQuestionIndex + 1}`;
    quizSection.innerHTML = `<div class="bg-white rounded-lg shadow-lg p-6 fade-in"><div class="flex justify-between items-center"><h2 class="text-xl font-bold text-gray-700 mb-2">${title}</h2><div id="timer" class="text-lg font-semibold text-[#FF69B4]">00:00</div></div><div class="progress-bar"><div id="progressFill"></div></div><h3 class="text-2xl font-semibold text-gray-800 my-6 text-center">${question.question}</h3><div id="answers-container" class="grid grid-cols-1 md:grid-cols-2 gap-4">${question.answers.map((answer, index) => `<button class="answer-btn p-4 border border-pink-200 rounded-lg text-left hover:bg-[#FFB6C1]/50 hover:border-[#FF69B4] transition" data-index="${index}">${answer}</button>`).join('')}</div><div id="explanation-area" class="mt-6 p-4 bg-[#FFFACD] border-l-4 border-yellow-400 rounded hidden"><h4 class="font-bold text-yellow-800">Giải thích</h4><p class="text-yellow-700 mt-1">${question.explanation}</p></div><div class="mt-8 flex justify-between"><button id="prevBtn" class="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition ${currentQuestionIndex === 0 || quizMode === 'practice' ? 'invisible' : ''}">Câu trước</button><button id="nextBtn" class="px-6 py-2 bg-[#FF69B4] text-white rounded-lg hover:bg-opacity-80 transition hidden">${currentQuestionIndex === questions.length - 1 ? 'Xem kết quả' : 'Câu tiếp'} <i class="fas fa-arrow-right ml-2"></i></button></div></div>`;
    document.getElementById('progressFill').style.width = `${((currentQuestionIndex + 1) / questions.length) * 100}%`;
    document.querySelectorAll('.answer-btn').forEach(button => { button.addEventListener('click', handleAnswerClick); });
    if (quizMode === 'normal' && currentQuestionIndex > 0) document.getElementById('prevBtn').addEventListener('click', showPreviousQuestion);
}

function handleAnswerClick(event) {
    const selectedButton = event.target.closest('.answer-btn');
    const selectedIndex = parseInt(selectedButton.dataset.index, 10);
    const question = questions[currentQuestionIndex];
    const isCorrect = selectedIndex === question.correctAnswerIndex;

    const answerButtons = document.querySelectorAll('.answer-btn');
    answerButtons.forEach((button, index) => {
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
            nextButton.classList.remove('hidden', 'bg-[#FF69B4]', 'hover:bg-opacity-80');
            nextButton.classList.add('bg-yellow-500', 'hover:bg-yellow-600');
            nextButton.addEventListener('click', () => showQuestion());
        }
    } else {
        userAnswers[currentQuestionIndex] = selectedIndex;
        if (isCorrect) score++;
        document.getElementById('nextBtn').classList.remove('hidden');
        document.getElementById('nextBtn').addEventListener('click', showNextQuestion);
    }
}

function showNextQuestion() { const quizContainer = document.querySelector('#quizSection .bg-white'); if (quizContainer) { quizContainer.classList.remove('fade-in'); quizContainer.classList.add('fade-out'); setTimeout(() => { if (currentQuestionIndex < questions.length - 1) { currentQuestionIndex++; showQuestion(); } else { endQuiz(); } }, 300); } }
function showPreviousQuestion() { const quizContainer = document.querySelector('#quizSection .bg-white'); if (quizContainer) { quizContainer.classList.remove('fade-in'); quizContainer.classList.add('fade-out'); setTimeout(() => { if (currentQuestionIndex > 0) { currentQuestionIndex--; showQuestion(); } }, 300); } }
function endQuiz() { clearInterval(quizTimerInterval); const totalTime = Math.floor((new Date() - quizStartTime) / 1000); const quizSection = document.getElementById('quizSection'); quizSection.innerHTML = ''; if (quizMode === 'normal') { const resultData = { score, totalQuestions: questions.length, percentage: questions.length > 0 ? parseFloat(((score / questions.length) * 100).toFixed(2)) : 0 }; if (auth.currentUser) { saveQuizResult({ ...resultData, timeTaken: totalTime }); checkAndAwardAchievements(resultData); } showResults(totalTime); } else { const resultsSection = document.getElementById('resultsSection'); resultsSection.classList.remove('hidden'); resultsSection.innerHTML = `<div class="bg-white rounded-lg shadow-lg p-8 text-center fade-in"><h2 class="text-3xl font-bold text-[#FF69B4]">Tuyệt vời!</h2><p class="text-gray-600 mt-2">Bạn đã hoàn thành luyện tập.</p><div class="mt-8 flex justify-center"><button id="backToHomeBtn" class="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition" onclick="window.location.href='index.html'"><i class="fas fa-home mr-2"></i> Về trang chủ</button></div></div>`; } }
function showResults(totalTime) { const resultsSection = document.getElementById('resultsSection'); resultsSection.classList.remove('hidden'); const percentage = questions.length > 0 ? ((score / questions.length) * 100).toFixed(2) : 0; const showPracticeButton = score < questions.length; resultsSection.innerHTML = `<div class="bg-white rounded-lg shadow-lg p-8 text-center fade-in"><h2 class="text-3xl font-bold text-[#FF69B4]">Hoàn thành!</h2><p class="text-gray-600 mt-2">Đây là kết quả của bạn:</p><div class="my-8"><p class="text-5xl font-bold text-[#FF69B4]">${percentage}%</p><p class="text-lg text-gray-700 mt-2">Đúng ${score}/${questions.length} câu</p></div><div class="text-md text-gray-500"><i class="fas fa-clock mr-2"></i> Thời gian: ${formatTime(totalTime)}</div><div class="mt-8 flex justify-center flex-wrap gap-4"><button id="restartQuizBtn" class="px-6 py-3 bg-[#FF69B4] text-white rounded-lg hover:bg-opacity-80 transition"><i class="fas fa-redo mr-2"></i> Làm lại</button>${showPracticeButton ? `<button id="practiceIncorrectBtn" class="px-6 py-3 bg-orange-400 text-white rounded-lg hover:bg-opacity-80 transition"><i class="fas fa-pencil-alt mr-2"></i> Luyện tập câu sai</button>` : ''}<button class="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition" onclick="window.location.href='index.html'"><i class="fas fa-home mr-2"></i> Về trang chủ</button></div></div>`; document.getElementById('restartQuizBtn').addEventListener('click', () => startQuiz(originalQuestions, 'normal')); if (showPracticeButton) document.getElementById('practiceIncorrectBtn').addEventListener('click', startIncorrectPracticeMode); }
function startIncorrectPracticeMode() { const incorrectQuestions = originalQuestions.filter((q, index) => userAnswers[index] !== q.correctAnswerIndex); if (incorrectQuestions.length > 0) startQuiz(incorrectQuestions, 'practice'); else alert("Không có câu nào sai để luyện tập!"); }
async function saveQuizResult(resultData) { const user = auth.currentUser; if (!user || originalQuestions.length === 0) return; try { await addDoc(collection(db, "quiz_results"), { userId: user.uid, quizTitle: currentQuizTitle, score: resultData.score, totalQuestions: resultData.totalQuestions, percentage: resultData.percentage, timeTaken: resultData.timeTaken, completedAt: new Date() }); console.log("Kết quả đã được lưu."); } catch (e) { console.error("Lỗi khi lưu kết quả: ", e); } }
async function checkAndAwardAchievements(result) { const user = auth.currentUser; if (!user) return; if (result.percentage === 100) await unlockAchievement(user.uid, 'GENIUS'); if (result.totalQuestions > 30) await unlockAchievement(user.uid, 'MARATHONER'); }
async function unlockAchievement(userId, achievementId) { const achievementRef = doc(db, 'users', userId, 'achievements', achievementId); const achievementSnap = await getDoc(achievementRef); if (!achievementSnap.exists()) { await setDoc(achievementRef, { unlockedAt: new Date() }); const achievement = achievements[achievementId]; alert(`Chúc mừng! Bạn đã mở khóa thành tựu: "${achievement.name}"!`); } }
function startTimer() { quizTimerInterval = setInterval(() => { const elapsedTime = Math.floor((new Date() - quizStartTime) / 1000); const timerInQuiz = document.getElementById('timer'); if (timerInQuiz) { timerInQuiz.textContent = formatTime(elapsedTime); } }, 1000); }
function formatTime(seconds) { const mins = Math.floor(seconds / 60).toString().padStart(2, '0'); const secs = (seconds % 60).toString().padStart(2, '0'); return `${mins}:${secs}`; }
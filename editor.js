// File: editor.js
import { db, auth } from './firebase-init.js';
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";
import { showToast } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
    const editorContainer = document.getElementById('editor-container');
    const saveBtn = document.getElementById('save-quiz-btn');
    let quizId = null;
    let quizData = {
        title: 'Bộ đề mới không tiêu đề',
        questions: []
    };

    onAuthStateChanged(auth, user => {
        if (user) {
            initEditor();
        } else {
            editorContainer.innerHTML = `<p class="text-center text-red-500">Vui lòng <a href="index.html" class="underline">đăng nhập</a> để sử dụng tính năng này.</p>`;
            saveBtn.disabled = true;
        }
    });

    async function initEditor() {
        const urlParams = new URLSearchParams(window.location.search);
        quizId = urlParams.get('id');

        if (quizId) {
            // Chế độ chỉnh sửa
            const docRef = doc(db, "quiz_sets", quizId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                quizData = docSnap.data();
                renderEditor();
            } else {
                editorContainer.innerHTML = `<p class="text-center text-red-500">Lỗi: Không tìm thấy bộ đề với ID này.</p>`;
            }
        } else {
            // Chế độ tạo mới
            renderEditor();
        }
    }

    function renderEditor() {
        // Chuẩn hóa mọi câu hỏi về dạng có trường 'options' là mảng đáp án
        if (Array.isArray(quizData.questions)) {
            quizData.questions.forEach(q => {
                // Nếu có trường 'answers' mà không có 'options', thì chuyển sang 'options'
                if (!Array.isArray(q.options) && Array.isArray(q.answers)) {
                    q.options = q.answers;
                }
                // Nếu không có trường nào, tạo rỗng
                if (!Array.isArray(q.options)) {
                    q.options = [];
                }
            });
        }
        editorContainer.innerHTML = `
            <div class="mb-6">
                <label class="cute-label">Tiêu đề bộ đề</label>
                <input id="quiz-title-input" type="text" value="${quizData.title || ''}" class="cute-input w-full text-lg font-bold" />
            </div>
            <div class="mb-6">
                <div class="flex justify-between items-center mb-2">
                    <span class="cute-label text-base">Danh sách câu hỏi</span>
                    <button id="add-question-btn" class="cute-add-btn"><i class="fas fa-plus mr-1"></i>Thêm câu hỏi</button>
                </div>
                <div id="questions-list">
                    ${quizData.questions && quizData.questions.length > 0 ? quizData.questions.map((q, idx) => renderQuestionBlock(q, idx)).join('') : '<div class="text-gray-400 italic">Chưa có câu hỏi nào.</div>'}
                </div>
            </div>
        `;
        addEditorEventListeners();
    }

    function renderQuestionBlock(q, idx) {
        // Chuẩn hóa trường đáp án đúng cho mọi loại dữ liệu bộ đề
        let correctIdx = 1;
        if (typeof q.answer === 'number') {
            correctIdx = q.answer;
        } else if (typeof q.correctAnswerIndex === 'number') {
            correctIdx = q.correctAnswerIndex + 1; // Nếu là chỉ số 0-based
        } else if (typeof q.correctAnswer === 'number') {
            correctIdx = q.correctAnswer;
        }
        // Nếu dữ liệu lỗi, đảm bảo nằm trong khoảng hợp lệ
        if (!Array.isArray(q.options) || correctIdx < 1 || correctIdx > (q.options?.length || 1)) correctIdx = 1;
        return `
        <div class="cute-question-block mb-4 relative" data-idx="${idx}">
            <div class="flex justify-between items-center mb-2">
                <span class="font-semibold text-pink-700">Câu ${idx + 1}</span>
                <button class="cute-remove-btn delete-question-btn" title="Xóa câu hỏi"><i class="fas fa-trash"></i></button>
            </div>
            <div class="cute-corner-icon"><i class="fas fa-star"></i></div>
            <label class="cute-label">Nội dung câu hỏi</label>
            <textarea class="question-content-input cute-textarea w-full mb-3" rows="2">${q.question || ''}</textarea>
            <div class="mb-2">
                <label class="cute-label">Đáp án</label>
                <div class="answers-list grid grid-cols-1 sm:grid-cols-2 gap-2">
                    ${(q.options || []).map((opt, i) => `
                        <div class="flex items-center gap-2">
                            <input type="radio" name="correct-answer-${idx}" class="correct-answer-radio cute-radio" ${correctIdx === (i + 1) ? 'checked' : ''} value="${i + 1}" title="Đáp án đúng" />
                            <input type="text" class="answer-input cute-input flex-1" value="${opt || ''}" placeholder="Đáp án ${String.fromCharCode(65 + i)}" />
                            <button class="cute-remove-btn delete-answer-btn" title="Xóa đáp án"><i class="fas fa-times"></i></button>
                        </div>
                    `).join('')}
                </div>
                <button class="cute-add-btn add-answer-btn mt-2" type="button"><i class="fas fa-plus"></i> Thêm đáp án</button>
            </div>
            <div class="mb-2">
                <label class="cute-label">Giải thích (không bắt buộc)</label>
                <textarea class="explanation-input cute-textarea w-full" rows="2">${q.explanation || ''}</textarea>
            </div>
        </div>
        `;
    }

    function addEditorEventListeners() {
        // Tiêu đề bộ đề
        document.getElementById('quiz-title-input').addEventListener('input', (e) => {
            quizData.title = e.target.value;
        });

        // Thêm câu hỏi
        document.getElementById('add-question-btn').addEventListener('click', () => {
            quizData.questions = quizData.questions || [];
            quizData.questions.push({ question: '', options: ['', '', '', ''], answer: 1, explanation: '' });
            renderEditor();
        });

        // Sự kiện từng block câu hỏi
        document.querySelectorAll('.question-block').forEach((block, idx) => {
            // Xóa câu hỏi
            block.querySelector('.delete-question-btn').addEventListener('click', () => {
                quizData.questions.splice(idx, 1);
                renderEditor();
            });

            // Nội dung câu hỏi
            block.querySelector('.question-content-input').addEventListener('input', (e) => {
                quizData.questions[idx].question = e.target.value;
            });

            // Đáp án đúng
            block.querySelectorAll('.correct-answer-radio').forEach((radio, optIdx) => {
                radio.addEventListener('change', (e) => {
                    if (e.target.checked) quizData.questions[idx].answer = Number(radio.value);
                });
            });

            // Đáp án
            block.querySelectorAll('.answer-input').forEach((input, optIdx) => {
                input.addEventListener('input', (e) => {
                    quizData.questions[idx].options[optIdx] = e.target.value;
                });
            });

            // Xóa đáp án
            block.querySelectorAll('.delete-answer-btn').forEach((btn, optIdx) => {
                btn.addEventListener('click', () => {
                    if (quizData.questions[idx].options.length > 2) {
                        quizData.questions[idx].options.splice(optIdx, 1);
                        // Nếu đáp án đúng bị xóa thì reset về 1
                        if (quizData.questions[idx].answer > quizData.questions[idx].options.length)
                            quizData.questions[idx].answer = 1;
                        renderEditor();
                    } else {
                        showToast('Mỗi câu hỏi phải có ít nhất 2 đáp án!', 'warning');
                    }
                });
            });

            // Thêm đáp án
            block.querySelector('.add-answer-btn').addEventListener('click', () => {
                if (!Array.isArray(quizData.questions[idx].options)) quizData.questions[idx].options = [];
                quizData.questions[idx].options.push('');
                renderEditor();
            });

            // Giải thích
            block.querySelector('.explanation-input').addEventListener('input', (e) => {
                quizData.questions[idx].explanation = e.target.value;
            });
        });
    }

    saveBtn.addEventListener('click', async () => {
        const user = auth.currentUser;
        if (quizId) {
            await setDoc(doc(db, "quiz_sets", quizId), { ...quizData, userId: user.uid });
        } else {
            await addDoc(collection(db, "quiz_sets"), { ...quizData, userId: user.uid, createdAt: serverTimestamp() });
        }
        showToast('Bộ đề đã được lưu thành công!', 'success');
        // const user = auth.currentUser;
        // if (quizId) { await setDoc(doc(db, "quiz_sets", quizId), { ...quizData, userId: user.uid }); } 
        // else { await addDoc(collection(db, "quiz_sets"), { ...quizData, userId: user.uid, createdAt: serverTimestamp() }); }
    });
});
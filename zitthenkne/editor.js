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
        editorContainer.innerHTML = `
            <h2 class="text-2xl font-bold text-gray-800 mb-6">Đây là nơi trình chỉnh sửa trực quan sẽ xuất hiện.</h2>
            <p class="text-gray-600">Tính năng này đang được phát triển. Hiện tại, bạn có thể hình dung một giao diện cho phép bạn:</p>
            <ul class="list-disc list-inside mt-4 space-y-2 text-gray-600">
                <li>Chỉnh sửa tiêu đề bộ đề: <input type="text" value="${quizData.title}" class="p-2 border rounded w-full"></li>
                <li>Thêm câu hỏi mới.</li>
                <li>Chỉnh sửa từng câu hỏi (nội dung, đáp án, giải thích).</li>
                <li>Xóa câu hỏi.</li>
                <li>Sắp xếp lại thứ tự câu hỏi.</li>
            </ul>
            <p class="mt-6 p-4 bg-blue-50 text-blue-800 rounded-lg">
                <i class="fas fa-info-circle mr-2"></i>
                Để thực hiện, cần xây dựng các hàm JavaScript để render các ô nhập liệu cho từng câu hỏi và xử lý các sự kiện (thêm, xóa, lưu) để cập nhật đối tượng <strong>quizData</strong>, sau đó gửi lên Firestore khi nhấn nút "Lưu thay đổi".
            </p>
        `;
    }

    saveBtn.addEventListener('click', () => {
        showToast('Tính năng lưu từ trình chỉnh sửa đang được phát triển!', 'info');
        // Logic lưu thực tế sẽ được thêm ở đây.
        // Ví dụ:
        // const user = auth.currentUser;
        // if (quizId) { await setDoc(doc(db, "quiz_sets", quizId), { ...quizData, userId: user.uid }); } 
        // else { await addDoc(collection(db, "quiz_sets"), { ...quizData, userId: user.uid, createdAt: serverTimestamp() }); }
    });
});
// quiz-history.js
import { db, auth } from './firebase-init.js';
import { collection, query, where, orderBy, getDocs } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.6.0/firebase-auth.js";

const urlParams = new URLSearchParams(window.location.search);
const quizId = urlParams.get('id');
const historyList = document.getElementById('history-list');

if (!quizId) {
    historyList.innerHTML = '<p class="text-red-500">Thiếu thông tin bộ đề.</p>';
} else {
    // Kiểm tra đăng nhập trước khi load lịch sử
    onAuthStateChanged(auth, user => {
        if (!user) {
            historyList.innerHTML = '<div class="text-center text-red-500 py-6">Bạn cần <a href="index.html" class="underline text-pink-500">đăng nhập</a> để xem lịch sử làm bài.</div>';
            return;
        }
        loadQuizHistory(quizId, user.uid);
    });
}

async function loadQuizHistory(quizId, userId) {
    historyList.innerHTML = '<div class="text-gray-400 text-center py-6">Đang tải lịch sử...</div>';
    try {
        const q = query(
            collection(db, "quiz_results"),
            where("quizId", "==", quizId),
            where("userId", "==", userId),
            orderBy("completedAt", "desc")
        );
        const querySnapshot = await getDocs(q);
        const history = [];
        querySnapshot.forEach(doc => {
            const data = doc.data();
            history.push({
                time: data.completedAt && data.completedAt.toDate ? formatDate(data.completedAt.toDate()) : "",
                score: data.score,
                total: data.totalQuestions,
                percentage: data.percentage
            });
        });
        if (history.length === 0) {
            historyList.innerHTML = '<p class="text-gray-500 py-6">Chưa có lần làm bài nào.</p>';
        } else {
            historyList.innerHTML = history.map(h => `
                <div class="flex items-center justify-between py-4">
                    <div class="flex flex-col">
                        <span class="font-semibold text-gray-700">${h.time}</span>
                        <span class="text-xs text-gray-400">Điểm: ${h.score} / ${h.total}</span>
                    </div>
                    <span class="text-pink-500 font-bold text-lg">${Math.round((h.score/h.total)*100)}%</span>
                </div>
            `).join('');
        }
    } catch (err) {
        console.error('Lỗi khi tải lịch sử:', err);
        historyList.innerHTML = '<p class="text-red-500">Lỗi khi tải lịch sử làm bài.</p>';
    }
}

function formatDate(date) {
    // Format: dd/MM/yyyy HH:mm
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    const hour = d.getHours().toString().padStart(2, '0');
    const min = d.getMinutes().toString().padStart(2, '0');
    return `${day}/${month}/${year} ${hour}:${min}`;
}

// Lịch chạy nhắc việc trong tiến trình (giờ VN):
//   - Nhắc deadline cho PIC (DM): MỖI NGÀY 1 LẦN, vào lần tick đầu tiên kể từ 8h.
//   - Báo cáo tiến độ vào nhóm Lark: mỗi ngày 1 lần lúc 9h.
// Kiểm mỗi phút cho đơn giản/chống trôi giờ; dùng khoá theo NGÀY VN để đảm bảo
// mỗi ngày chỉ chạy 1 lần dù kiểm nhiều lần (dedup sent_reminders vẫn là chốt
// chặn cuối, nên khởi động lại giữa ngày cũng không gửi trùng).

const { remindersEnabled } = require('../../config/env');
const { isLarkConfigured } = require('../lark/larkClient');
const { runReminders } = require('./reminderService');
const { sendDailyReport } = require('./reportService');

const TZ = 'Asia/Ho_Chi_Minh';
const REMINDER_HOUR = 8;  // nhắc deadline bắt đầu từ 8h
const END_HOUR = 17;      // khung cho phép chạy bù trong ngày nếu khởi động muộn
const REPORT_HOUR = 9;    // báo cáo nhóm mỗi 9h sáng

let lastRunKey = null;    // nhắc PIC — theo NGÀY (mỗi ngày 1 lần)
let lastReportKey = null; // báo cáo nhóm theo ngày

function vnHour() {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hourCycle: 'h23' }).format(new Date()),
  );
}

function vnDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

async function tick() {
  try {
    const h = vnHour();

    // 1) Báo cáo tiến độ vào nhóm Lark — mỗi ngày 1 lần lúc 9h sáng.
    if (h === REPORT_HOUR) {
      const dk = vnDateKey();
      if (dk !== lastReportKey) {
        lastReportKey = dk;
        const rr = await sendDailyReport();
        console.log(`[report] ${dk} ->`, JSON.stringify(rr.sentTo || rr.error || rr.counts));
      }
    }

    // 2) Nhắc việc cho PIC (DM) — MỖI NGÀY 1 LẦN, chạy ở lần tick đầu tiên kể từ
    //    8h (nếu khởi động muộn thì chạy bù trong ngày, tới 17h). Chỉ còn
    //    due_soon/overdue; 'việc mới giao' gửi ngay khi phân PIC (notifyAssignment).
    if (h >= REMINDER_HOUR && h <= END_HOUR) {
      const dk = vnDateKey();
      if (dk !== lastRunKey) {
        lastRunKey = dk;
        const res = await runReminders();
        console.log(`[reminders] ${dk} ->`, JSON.stringify(res));
      }
    }
  } catch (err) {
    console.error('[scheduler] tick lỗi:', err.message);
  }
}

function startReminderScheduler() {
  if (!remindersEnabled) {
    console.log('[reminders] tắt (REMINDERS_ENABLED=false)');
    return;
  }
  if (!isLarkConfigured) {
    console.log('[reminders] chưa cấu hình Lark -> không bật nhắc việc');
    return;
  }
  // Chạy thử ngay khi khởi động (nếu đang trong khung giờ). Lần đầu bảng rỗng sẽ
  // chỉ ghi nhận hiện trạng, không gửi.
  tick();
  const now = new Date();
  const msToNextMinute = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds());
  setTimeout(() => {
    tick();
    setInterval(tick, 60000);
  }, msToNextMinute);
  console.log('[reminders] scheduler bật — nhắc deadline mỗi ngày 1 lần (từ 8h) + báo cáo nhóm 9h sáng (giờ VN); việc mới giao gửi ngay khi phân PIC');
}

module.exports = { startReminderScheduler };

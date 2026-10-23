"use client";
import { useShared } from "./dashboard/shared";
import { useReceipts } from "./dashboard/useReceipts";
import { useAccount } from "./dashboard/useAccount";
import { useMailImport } from "./dashboard/useMailImport";

// รวมข้อมูลและการกระทำทั้งหมดของแดชบอร์ดไว้ที่เดียว (หน้าจอเรียกใช้ที่นี่ที่เดียว)
//   shared        ข้อความแจ้งเตือน / สถานะกำลังทำงาน / ค่าล่าสุด
//   useReceipts   ใบเสร็จ: โหลด อนุมัติ แก้ ลบ ดูรูป Excel
//   useAccount    ล็อกอิน workspace สิทธิ์ LINE บริษัท รหัสเชิญ
//   useMailImport ดึงใบเสร็จจาก Gmail
export function useDashboard() {
  const shared = useShared();
  const rc = useReceipts(shared);
  const account = useAccount(shared, rc);
  const mail = useMailImport(shared, rc.load);

  return {
    ...account,
    receipts: rc.receipts, rcError: rc.rcError,
    review: rc.review, saveEdit: rc.saveEdit, deleteReceipt: rc.remove, signedImageUrl: rc.imageUrl, exportExcel: rc.exportExcel,
    mail: mail.mail, mailStatus: mail.status, closeMail: mail.closeMail, scanMail: mail.scan, importMail: mail.importPicked,
    toast: shared.toast, toastMsg: shared.toastMsg, busy: shared.busy,
  };
}

export type Dashboard = ReturnType<typeof useDashboard>;

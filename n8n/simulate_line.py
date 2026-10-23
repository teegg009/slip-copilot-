"""ส่งข้อความ LINE จำลองไปที่ webhook ของ n8n (พร้อมลายเซ็นที่ถูกต้อง)

ใช้ทดสอบ workflow v3 โดยไม่ต้องสลับ Webhook URL ของ LINE จริง
LINE_SECRET อ่านจาก environment variable เท่านั้น (ไม่รับทาง argument เพื่อไม่ให้ค้างในประวัติคำสั่ง)

    $env:LINE_SECRET = "<secret ที่ใส่ใน node Sign>"
    python n8n/simulate_line.py "ผูก 123456" --user Utest1
    python n8n/simulate_line.py "สวัสดี" --user Utest1 --url http://localhost:5678/webhook-test/line-v3

หมายเหตุ: replyToken เป็นของปลอม ดังนั้นขั้น Send Reply จะได้ error จาก LINE (ปกติ)
ให้ดูผลที่หน้า Executions ของ n8n ว่า Build Reply สร้างการ์ดอะไรออกมา
"""
import argparse
import base64
import hashlib
import hmac
import json
import os
import sys
import urllib.error
import urllib.request

p = argparse.ArgumentParser()
p.add_argument("text", nargs="?", default="", help="ข้อความที่ผู้ใช้พิมพ์ เช่น 'ผูก 123456'")
p.add_argument("--image", metavar="MESSAGE_ID", help="จำลองการส่งรูป (ใช้รหัสข้อความปลอมได้ เพื่อทดสอบเส้นทางรูป)")
p.add_argument("--user", default="Utest1", help="LINE user id จำลอง")
p.add_argument("--url", default="http://localhost:5678/webhook-test/line-v3")
args = p.parse_args()

secret = os.environ.get("LINE_SECRET")
if not secret:
    sys.exit("ตั้ง LINE_SECRET ใน environment ก่อน (ดูวิธีที่หัวไฟล์)")

if args.image:
    message = {"type": "image", "id": args.image, "contentProvider": {"type": "line"}}
elif args.text:
    message = {"type": "text", "id": "1", "text": args.text}
else:
    sys.exit("ใส่ข้อความ หรือใช้ --image MESSAGE_ID")

body = json.dumps({
    "destination": "Utest",
    "events": [{
        "type": "message", "mode": "active", "timestamp": 0,
        "source": {"type": "user", "userId": args.user},
        "replyToken": "00000000000000000000000000000000",
        "message": message,
    }],
}, ensure_ascii=False).encode("utf-8")
sig = base64.b64encode(hmac.new(secret.encode(), body, hashlib.sha256).digest()).decode()

req = urllib.request.Request(args.url, data=body, method="POST",
                             headers={"Content-Type": "application/json", "x-line-signature": sig})
try:
    with urllib.request.urlopen(req, timeout=20) as r:
        print(r.status, r.read().decode()[:300])
except urllib.error.HTTPError as e:
    print(e.code, e.read().decode()[:300])

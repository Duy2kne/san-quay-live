# 🪩 SÀN QUẨY LIVE 3D - BIẾN TIKTOK LIVE THÀNH SÀN NHẢY NIGHTCLUB

Trang web tương tác 3D thời gian thực biến phiên phát trực tiếp TikTok Live thành sàn nhảy Nightclub sôi động. Mỗi người xem vào phòng sẽ có một nhân vật Chibi rơi từ trên trời xuống, mang ảnh đại diện và tên TikTok, quẩy theo điệu nhạc YouTube đồng bộ, tặng quà sẽ kích hoạt hiệu ứng 3D mãn nhãn và thăng cấp từ 0 đến 100.

> **Tuyên bố miễn trừ trách nhiệm:** Đây là dự án mã nguồn mở độc lập, không liên kết, tài trợ hoặc chứng thực bởi TikTok hay ByteDance. Ứng dụng không sử dụng logo TikTok và chỉ phục vụ cho kênh của chính bạn hoặc kênh đã được cho phép.

---

## 🌟 TÍNH NĂNG NỔI BẬT

1. **Kết nối TikTok Live độc quyền qua Admin**: Chỉ quản trị viên nhập mật khẩu mới được dán link live (`https://www.tiktok.com/@tenkenh/live`, `@tenkenh` hoặc `tenkenh`).
2. **Đổi nhân vật Nam / Nữ bằng bình luận**:
   - Bình luận `nam`, `trai`, `boy` ➔ Đổi thành nhân vật Nam.
   - Bình luận `nu`, `nữ`, `gai`, `gái`, `girl` ➔ Đổi thành nhân vật Nữ.
   - So khớp chuẩn xác (Unicode NFC, chỉ đổi khi cả bình luận là từ khoá để tránh nhầm "năm nay"), hiệu ứng xoay 360° kèm làn khói lấp lánh (sparkling smoke poof), lưu vĩnh viễn theo `userId`, chống spam 10s/người.
3. **Thẻ tên nổi phía trên nhân vật (Billboard Sprite)**:
   - Ảnh đại diện TikTok hình tròn có viền cấp độ / vương miện Top 1–3, tên người xem, huy hiệu `Lv.XX`.
   - Mặt nhân vật giữ nét Chibi tự nhiên (mắt anime long lanh, má hồng, nụ cười) thay vì dán đè ảnh avatar lên mặt.
4. **Khu vực DJ Sân Khấu & DJ Tương Tác 10 Động Tác**:
   - Sân khấu có rào chắn ngăn sàn nhảy, bàn DJ CDJ + Mixer nháy LED + Laptop, 4 họng pháo khói CO2 tự động phụt mạnh khi có Drop nhạc hoặc quà lớn.
   - DJ biểu diễn theo nhịp BPM: gật đầu, vặn núm mixer, scratch đĩa, giơ tay đấm trời, vỗ tay trên đầu ở đoạn build-up, nhảy bật lên khi drop nhạc, cúi chào cảm ơn khi có quà lớn.
5. **Bình luận từ khoá kích hoạt Hiệu ứng & Điệu nhảy**:
   - `like`, `thích`, `👍` ➔ Giơ ngón cái, biểu tượng 👍 to bay lên.
   - `yêu`, `iu`, `love`, `thương`, `❤️` ➔ Bắn tim, trái tim ❤️ to bay lên.
   - `hay`, `cháy`, `nhiệt`, `quá đã`, `🔥` ➔ Đốm lửa 🔥 bốc lên, solo sân khấu.
   - `quẩy`, `nhảy`, `dance`, `lên nhạc`, `🎉` ➔ Pháo bông 🎉 tung bay, nhảy shuffle.
   - `đẹp`, `xinh`, `cute`, `đỉnh`, `✨` ➔ Xoay vòng, ánh sao lấp lánh ✨.
   - `haha`, `kaka`, `hehe`, `lol`, `😂` ➔ Lắc hông cười, icon 😂 bay lên.
   - `chào`, `hi`, `hello`, `helo`, `👋` ➔ Vẫy tay chào 👋.
   - `headbang`, `rock`, `quạt chả`, `🤘` ➔ Gật đầu quạt chả, biểu tượng 🤘.
   - **Đại tiệc cả sàn**: Khi có $\ge 10$ người bình luận trong vòng 15 giây, toàn sàn nhảy đồng loạt quẩy tung nóc!
6. **Khán đài Stadium 1.000 người & Nút "Giả lập 500 người vào"**:
   - Khán đài bậc thang vòng cung phía sau sàn nhảy vẽ bằng `InstancedMesh` lên tới 1.000 nhân vật nhún nhảy theo phách nhạc cực mượt.
   - Tự động hạ đồ hoạ (dynamic bloom degradation) nếu FPS rơi xuống dưới 40 để đảm bảo phát sóng ổn định.
7. **Cột LED Totem vinh danh Top 1 & Top 2 và Bục 3 Bậc (Podium)**:
   - 2 cột LED khổng lồ bên cạnh DJ hiển thị ảnh đại diện và tên Top 1 & Top 2.
   - Bục vinh danh 3 bậc Vàng - Bạc - Đồng dành riêng cho Top 1-3 đứng quẩy trên sân khấu.
8. **14 Điệu Nhảy & 15 Hiệu Ứng Quà Tặng 3D**:
   - 1–4 kim cương: Nâng ly chúc mừng, tim bay.
   - 5–29 kim cương: Nhảy tưng bừng, pháo giấy nhỏ.
   - 30–99 kim cương: Moonwalk, robot, đèn sàn đổi màu cá nhân.
   - 100–499 kim cương: Solo trên sân khấu dưới ánh đèn Spotlight rực rỡ, tên xuất hiện trên màn hình LED khổng lồ.
   - 500–999 kim cương: Đứng cạnh DJ trên sân khấu, cả sàn vỗ tay, mưa tiền / mưa hoa hồng, máy quay Drone lượn cận cảnh.
   - 1.000–9.999 kim cương: Show VIP sân khấu, toàn sàn quẩy đồng loạt, pháo hoa cực đại, âm thanh drop nhạc.
   - ≥ 10.000 kim cương: Siêu show cưỡi Rồng / Sư tử ánh sáng bay quanh vũ trường, toàn bộ sàn hóa vàng kim.
9. **Hệ Thống Thăng Cấp 0–100**:
   - Tính theo tổng donate: `Cấp = min(100, floor(sqrt(XP / 10)))`.
   - Cấp càng cao mở khóa hào quang, vòng sáng chân, cánh phát sáng, vương miện, dù đáp đất.
10. **Nhạc YouTube Đồng Bộ Thời Gian Thực & Tap Tempo**:
   - Admin dán link YouTube (video đơn, shorts, playlist), toàn bộ các màn hình phát cùng một bài tại cùng một giây.
   - Đồng hồ BPM và nút **"Bấm theo nhịp" (Tap Tempo)** giúp đèn moving head, laser và nhân vật nhún chuẩn từng phách nhạc.
11. **Tích hợp OBS Studio & TikTok LIVE Studio**: Hỗ trợ chế độ Overlay `?overlay=1` và nền trong suốt `&transparent=1`.
12. **Lưu trữ JSON an toàn**: Ghi dữ liệu nguyên tử (atomic write qua file tạm), tự động lưu mỗi 30s và khi tắt server.

---

## 🚀 HƯỚNG DẪN CÀI ĐẶT & CHẠY LOCAL

### Yêu cầu hệ thống:
- Node.js phiên bản 20 trở lên (`node -v`)
- npm 9+

### Các bước thực hiện:

1. **Cài đặt thư viện phụ thuộc:**
   ```bash
   npm ci
   ```

2. **Cấu hình biến môi trường:**
   Tạo file `.env` từ file `.env.example`:
   ```bash
   cp .env.example .env
   ```
   Mở file `.env` và đặt mật khẩu quản trị bí mật:
   ```ini
   PORT=3000
   ADMIN_PASSWORD=MatKhauCuaBan123!
   MAX_AVATARS=80
   AVATAR_IDLE_MINUTES=10
   LEVEL_FACTOR=10
   ```

3. **Đóng gói mã nguồn Client (esbuild):**
   ```bash
   npm run build
   ```

4. **Khởi động server:**
   - Chạy bình thường:
     ```bash
     npm start
     ```
   - Hoặc chạy chế độ phát triển (tự động theo dõi file và khởi động lại):
     ```bash
     npm run dev
     ```

5. **Truy cập ứng dụng trên trình duyệt:**
   - Sàn nhảy 3D chính: `http://localhost:3000`
   - Trang quản trị: `http://localhost:3000/admin`
   - Bảng xếp hạng Top 100: `http://localhost:3000/top`
   - Chế độ OBS: `http://localhost:3000/?overlay=1&transparent=1`

---

## 🎮 CHẾ ĐỘ DEMO (GIẢ LẬP ĐỂ TEST)

Nếu bạn chưa có phiên Live TikTok đang phát, bạn có thể kiểm tra toàn bộ tính năng bằng chế độ Demo:
1. Vào `http://localhost:3000/admin`, đăng nhập bằng `ADMIN_PASSWORD`.
2. Tại tab **"Phiên Live"**, bấm **"Bật Demo (Giả lập)"**.
3. Hệ thống sẽ tự động tạo người xem Chibi rơi từ trên trời xuống, gửi tin nhắn chat tiếng Việt, thả tim tạo combo PERFECT/GREAT, tặng hoa hồng, súng bắn tiền, vũ trụ TikTok để phô diễn trọn vẹn 15 hiệu ứng 3D.
4. Dữ liệu Demo chạy độc lập, không làm ảnh hưởng đến dữ liệu donate thật của kênh.

---

## 🎥 CÀI ĐẶT VÀO OBS STUDIO & TIKTOK LIVE STUDIO

1. Trong OBS Studio, tại mục **Sources (Nguồn)**, bấm dấu **`+`** và chọn **Browser (Trình duyệt)**.
2. Đặt URL là:
   ```
   http://localhost:3000/?overlay=1&transparent=1
   ```
   *(Thay `localhost:3000` bằng địa chỉ server deploy thật của bạn khi phát sóng từ xa)*.
3. Cài đặt kích thước:
   - Khung hình ngang: **Width 1920, Height 1080**
   - Khung hình dọc (phù hợp TikTok LIVE Studio): **Width 1080, Height 1920**
4. Tích chọn ô: **"Control audio via OBS" (Kiểm soát âm thanh qua OBS)** để nhạc YouTube và hiệu ứng ting quà phát thẳng vào buổi live.
5. Tích chọn ô: **"Shutdown source when not visible"** và **"Refresh browser when scene becomes active"**.

---

## 🎵 NHẠC YOUTUBE & CHỈNH NHỊP BPM (TAP TEMPO)

- **Thêm bài hát**: Vào tab **"Nhạc"** trong `/admin`, dán link YouTube bất kỳ (`watch?v=...`, `youtu.be/...`, `shorts/...`, hoặc link playlist) rồi bấm **"Thêm vào hàng chờ"** hoặc **"Phát ngay"**.
- **Đồng bộ nhịp đèn (BPM)**:
  - Khi bài hát đang phát, bấm nút **"🥁 Bấm theo nhịp (Tap Tempo)"** đều đặn theo tiếng bass/kick khoảng 8–16 lần.
  - Hệ thống tự động tính ra BPM chuẩn của bài hát và lưu lại.
  - Mọi đèn moving head, laser và các nhân vật chibi sẽ nhún nhảy đúng từng phách nhạc!
- **Lưu ý bản quyền**: Phát nhạc có bản quyền trên TikTok Live có thể bị nền tảng tắt tiếng hoặc cảnh báo vi phạm. Khuyến khích sử dụng các danh sách nhạc NoCopyrightSounds (NCS) hoặc thư viện nhạc miễn phí bản quyền YouTube Audio Library.

---

## 💾 SAO LƯU & KHÔI PHỤC DỮ LIỆU

- Dữ liệu người donate, cấp độ, hàng chờ nhạc và nhật ký quà được lưu trữ tự động trong thư mục `data/`.
- Trước khi nâng cấp server hoặc deploy phiên bản mới, vào tab **"Nhật ký & Sao lưu"** trong `/admin`:
  - Bấm **"Tải Bản Sao Lưu (JSON)"** để tải về file sao lưu toàn vẹn.
  - Sau khi deploy, bạn có thể bấm **"Chọn file"** để khôi phục toàn bộ danh sách donate và cấp độ ngay tức thì.
  - Có thể xuất file **CSV** để tổng hợp doanh thu kim cương cho streamer.

---

## ☁️ TRIỂN KHAI LÊN RENDER / CLOUD

### 1. Triển khai lên Render (Web Service)
- Kết nối GitHub Repository vào Render.
- Tạo mới một **Web Service**:
  - **Runtime**: `Node`
  - **Build Command**: `npm ci && npm run build`
  - **Start Command**: `npm start`
  - **Plan**: Free (hoặc Starter nếu cần gắn Persistent Disk).
- Thêm biến môi trường trong tab **Environment**:
  - `ADMIN_PASSWORD`: *(Mật khẩu quản trị bí mật của bạn)*
  - `NODE_ENV`: `production`
- **Lưu ý ổ đĩa Render Free**: Ổ đĩa của gói miễn phí sẽ bị reset mỗi lần khởi động lại. Do đó, hãy sử dụng tính năng **Tải Bản Sao Lưu** trong admin trước mỗi lần deploy, hoặc nâng cấp gói trả phí có gắn **Persistent Disk** vào đường dẫn `./data`.

### 2. Triển khai lên VPS (Ubuntu / Debian + PM2 + Nginx)
```bash
# 1. Cài đặt Node.js 20 và PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

# 2. Clone repo và build
git clone <URL_REPO_CỦA_BẠN> /var/www/san-quay-live
cd /var/www/san-quay-live
cp .env.example .env
nano .env # điền ADMIN_PASSWORD

npm ci
npm run build

# 3. Chạy với PM2
pm2 start server.js --name san-quay-live
pm2 save
pm2 startup
```

Cấu hình Nginx Reverse Proxy hỗ trợ WebSocket (Socket.IO):
```nginx
server {
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 🔒 LƯU Ý VỀ KẾT NỐI TIKTOK LIVE

- TikTok có thể áp dụng giới hạn tần suất kết nối hoặc chặn IP từ một số nhà cung cấp dịch vụ đám mây công cộng (như Render, AWS, DigitalOcean).
- Nếu gặp lỗi giới hạn kết nối:
  1. Thử chạy server trên VPS có IP sạch hoặc chạy ngay trên máy tính cá nhân (Localhost) nơi bạn mở OBS.
  2. Bổ sung `TIKTOK_SIGN_API_KEY` vào file `.env` nếu bạn sử dụng dịch vụ ký API của bên thứ ba.
  3. Hoặc sử dụng tính năng **Demo** để biểu diễn sàn quẩy offline mà không cần phụ thuộc vào kết nối trực tiếp với TikTok.

---

Chúc bạn có những buổi livestream TikTok bùng nổ và thu hút hàng ngàn người xem cùng quẩy trên **Sàn Quẩy Live 3D**! 🚀

# 骰界 RNG Supabase Auth 郵件範本

這份文件提供可直接貼入 Supabase Dashboard 的繁體中文郵件內容。網站程式已將註冊驗證與密碼重設的回跳網址設為：

`https://hermes0403.github.io/dice-realm-rng/`

Supabase Auth 的郵件範本設定不在 GitHub 程式碼內；目前沒有可安全修改郵件範本的已連線管理介面，因此這份文件只提供內容，不代表 Dashboard 已經套用。

## 註冊驗證信

**Subject**

骰界 RNG｜請完成信箱驗證

**Body（HTML）**

```html
<h2>歡迎加入骰界 RNG</h2>
<p>您好，您剛剛建立了骰界 RNG 帳號。</p>
<p>請點擊下方按鈕完成 Email 驗證。驗證成功後，系統會自動帶您返回遊戲。</p>
<p><a href="{{ .ConfirmationURL }}">驗證信箱並進入骰界</a></p>
<p>如果按鈕無法使用，請複製以下完整連結並貼到瀏覽器網址列：</p>
<p>{{ .ConfirmationURL }}</p>
<p>如果這不是您提出的註冊要求，請忽略這封信即可。</p>
<p>骰界 RNG 團隊</p>
```

## 密碼重設信

**Subject**

骰界 RNG｜密碼重設請求

**Body（HTML）**

```html
<h2>重設骰界 RNG 密碼</h2>
<p>我們收到一筆密碼重設請求。</p>
<p>請點擊下方按鈕，返回骰界 RNG 設定新密碼。</p>
<p><a href="{{ .ConfirmationURL }}">設定新密碼並返回骰界</a></p>
<p>如果按鈕無法使用，請複製以下完整連結並貼到瀏覽器網址列：</p>
<p>{{ .ConfirmationURL }}</p>
<p>如果不是您提出的請求，請忽略這封信；您的密碼不會因此改變。</p>
<p>骰界 RNG 團隊</p>
```

## Supabase Dashboard 必要設定

1. Auth → URL Configuration。
2. Site URL 設為 `https://hermes0403.github.io/dice-realm-rng/`。
3. Redirect URLs 加入同一個網址（包含結尾斜線）。
4. Auth → Email Templates，分別更新 Confirm signup 與 Reset Password 範本。
5. 儲存後，使用一個測試帳號實際點擊註冊驗證信與密碼重設信，確認兩者都返回骰界。

注意：若仍使用 Supabase 內建郵件服務，郵件寄送額度仍由 Supabase 伺服器限制；修改範本不會提高寄信額度。不要把 SMTP 密碼、Service Role Key 或其他秘密放進 repository。

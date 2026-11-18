import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const allowedOrigins = new Set([
  "https://hermes0403.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
]);

function headersFor(origin: string | null) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    "Vary": "Origin"
  };
  if (origin && allowedOrigins.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), { status, headers: headersFor(origin) });
}

function normalizeUsername(value: unknown) {
  return String(value ?? "").normalize("NFKC").trim();
}

function isValidUsername(username: string) {
  return /^[\p{L}\p{N}_-]{3,20}$/u.test(username);
}

function normalizeUsernameKey(username: string) {
  return username.toLowerCase();
}

function getClientIp(req: Request) {
  return req.headers.get("cf-connecting-ip")
    || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || "unknown";
}

async function sha256Hex(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}

async function allowRequest(req: Request, action: "username_login" | "username_register", limit: number, windowSeconds: number) {
  const keyHash = await sha256Hex(action + "|" + getClientIp(req));
  const { data, error } = await admin.rpc("consume_player_auth_rate_limit", {
    p_action: action,
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: windowSeconds
  });
  if (error) throw new Error("rate_limit_unavailable");
  return data === true;
}

async function passwordGrant(email: string, password: string) {
  const response = await fetch(supabaseUrl + "/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: {
      "apikey": anonKey,
      "Authorization": "Bearer " + anonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email, password })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.access_token || !payload?.refresh_token) {
    return { ok: false, status: response.status };
  }
  return {
    ok: true,
    session: {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token
    }
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  if (origin && !allowedOrigins.has(origin)) return json({ error: "不允許的來源" }, 403, origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers: headersFor(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "請求格式錯誤" }, 400, origin);
  }

  const action = String(body.action || "");
  if (action !== "username_login" && action !== "username_register") {
    return json({ error: "不支援的操作" }, 400, origin);
  }

  const username = normalizeUsername(body.username);
  if (!isValidUsername(username)) {
    return json({ error: "玩家名稱需為 3 至 20 個字元，只能使用文字、數字、底線或連字號。" }, 400, origin);
  }
  const usernameNormalized = normalizeUsernameKey(username);
  const password = String(body.password || "");
  if (password.length < 6 || password.length > 128) {
    return json({ error: "密碼長度不符合要求。" }, 400, origin);
  }

  try {
    if (action === "username_login") {
      if (!await allowRequest(req, "username_login", 12, 300)) {
        return json({ error: "登入嘗試太頻繁，請稍後再試。" }, 429, origin);
      }

      const { data: mapping, error: mappingError } = await admin
        .from("player_login_names")
        .select("user_id")
        .eq("username_normalized", usernameNormalized)
        .maybeSingle();
      if (mappingError) throw mappingError;

      if (!mapping?.user_id) {
        // Perform a dummy Auth request so unknown names and wrong passwords share the same response.
        await passwordGrant("missing-" + crypto.randomUUID() + "@accounts.dice-realm.invalid", password);
        return json({ error: "帳號或密碼不正確。" }, 401, origin);
      }

      const { data: target, error: targetError } = await admin.auth.admin.getUserById(mapping.user_id);
      const email = target?.user?.email;
      if (targetError || !email) {
        return json({ error: "帳號或密碼不正確。" }, 401, origin);
      }

      const result = await passwordGrant(email, password);
      if (!result.ok) {
        return json({
          error: result.status === 429 ? "登入嘗試太頻繁，請稍後再試。" : "帳號或密碼不正確。"
        }, result.status === 429 ? 429 : 401, origin);
      }
      return json({ success: true, session: result.session }, 200, origin);
    }

    if (password.length < 8) {
      return json({ error: "新密碼至少需要 8 位。" }, 400, origin);
    }
    if (!await allowRequest(req, "username_register", 5, 3600)) {
      return json({ error: "註冊操作太頻繁，請稍後再試。" }, 429, origin);
    }

    const { data: existing, error: existingError } = await admin
      .from("player_login_names")
      .select("user_id")
      .eq("username_normalized", usernameNormalized)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.user_id) {
      return json({ error: "這個玩家名稱已被使用，請換一個名稱。" }, 409, origin);
    }

    // Admin createUser does not send an invitation or verification email.
    // The reserved .invalid domain is an internal Auth identifier only.
    const internalEmail = crypto.randomUUID() + "@accounts.dice-realm.invalid";
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: internalEmail,
      password,
      email_confirm: true,
      user_metadata: { username }
    });
    if (createError || !created?.user?.id) {
      return json({ error: "目前無法建立帳號，請稍後再試。" }, 500, origin);
    }

    const userId = created.user.id;
    const { error: insertError } = await admin.from("player_login_names").insert({
      user_id: userId,
      username,
      username_normalized: usernameNormalized
    });
    if (insertError) {
      await admin.auth.admin.deleteUser(userId, false).catch(() => {});
      if (insertError.code === "23505") {
        return json({ error: "這個玩家名稱已被使用，請換一個名稱。" }, 409, origin);
      }
      throw insertError;
    }

    const result = await passwordGrant(internalEmail, password);
    if (!result.ok) {
      return json({
        success: true,
        autoLogin: false,
        message: "註冊成功，請返回登入畫面並使用玩家名稱登入。"
      }, 201, origin);
    }
    return json({ success: true, session: result.session }, 201, origin);
  } catch (error) {
    console.error("Player auth request failed:", String(error?.message || error));
    return json({ error: "目前無法完成操作，請稍後再試。" }, 503, origin);
  }
});

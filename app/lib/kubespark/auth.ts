/**
 * 认证相关 API
 */

import { API_PROXY_BASE } from "./common";

export type LoginRequest = {
  username: string;
  password: string;
};

export type LoginResponse = {
  code: number;
  message: string;
  data: {
    token: string;
  };
};

/**
 * 登录
 * 通过代理调用后端登录接口
 */
export async function login(credentials: LoginRequest): Promise<LoginResponse> {
  const url = `${API_PROXY_BASE}/kapis/auth.kubespark.io/v1/login`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(credentials),
  });

  const data = await response.json();
  
  // 检查 HTTP 状态码和业务状态码
  if (!response.ok || data.code !== 200) {
    const errorMessage = data.message || "登录失败";
    throw new Error(errorMessage);
  }

  // 验证响应数据结构
  if (!data.data || !data.data.token) {
    throw new Error("登录响应格式错误：缺少 token");
  }

  return data;
}

/**
 * 登出（清除本地 token）
 */
export function logout(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("kubespark_token");
    sessionStorage.removeItem("kubespark_token");
  }
}

/**
 * 获取存储的 token
 */
export function getToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  // 优先从 localStorage 获取，如果没有则从 sessionStorage 获取
  return localStorage.getItem("kubespark_token") || sessionStorage.getItem("kubespark_token");
}

/**
 * 保存 token
 */
export function saveToken(token: string, rememberMe: boolean = false): void {
  if (typeof window === "undefined") {
    return;
  }
  if (rememberMe) {
    localStorage.setItem("kubespark_token", token);
    // 清除 sessionStorage 中的 token
    sessionStorage.removeItem("kubespark_token");
  } else {
    sessionStorage.setItem("kubespark_token", token);
    // 清除 localStorage 中的 token
    localStorage.removeItem("kubespark_token");
  }
}

/**
 * 解析 JWT token，提取用户信息
 */
export function parseToken(token: string | null): { username: string | null; role: string | null } {
  if (!token) {
    return { username: null, role: null };
  }

  try {
    // JWT token 格式：header.payload.signature
    const parts = token.split(".");
    if (parts.length !== 3) {
      return { username: null, role: null };
    }

    // 解析 payload（第二部分）
    const payload = parts[1];
    // Base64URL 解码（需要处理 - 和 _ 字符，并添加 padding）
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const decoded = atob(padded);
    const parsed = JSON.parse(decoded);

    // 尝试从不同字段获取用户名和角色
    const username =
      parsed.username || parsed.name || parsed.sub || parsed.user || null;
    
    // 角色可能是单个字符串或数组
    let role: string | null = null;
    if (parsed.role) {
      role = typeof parsed.role === "string" ? parsed.role : parsed.role[0] || null;
    } else if (parsed.roles && Array.isArray(parsed.roles) && parsed.roles.length > 0) {
      role = parsed.roles[0];
    } else if (parsed.authorities && Array.isArray(parsed.authorities) && parsed.authorities.length > 0) {
      role = parsed.authorities[0];
    }

    return { username, role };
  } catch (error) {
    console.error("解析 token 失败:", error);
    return { username: null, role: null };
  }
}

/**
 * 获取当前用户信息（从 token 中解析）
 */
export function getCurrentUser(): { username: string | null; role: string | null } {
  const token = getToken();
  return parseToken(token);
}


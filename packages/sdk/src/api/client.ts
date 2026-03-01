/**
 * Copyright 2025 NKZ Platform (Nekazari)
 * Licensed under Apache-2.0
 */

export interface NKZClientOptions {
  baseUrl: string;
  getToken?: () => string | undefined;
  getTenantId?: () => string | undefined;
  defaultHeaders?: Record<string, string>;
}

export class NKZClient {
  private readonly baseUrl: string;
  private readonly getToken?: () => string | undefined;
  private readonly getTenantId?: () => string | undefined;
  private readonly defaultHeaders: Record<string, string>;

  constructor(options: NKZClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.getToken = options.getToken;
    this.getTenantId = options.getTenantId;
    this.defaultHeaders = options.defaultHeaders ?? {};
  }

  async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.getToken?.();
    const tenant = this.getTenantId?.();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
      ...(init.headers as Record<string, string> | undefined),
    };

    if (token && !headers.Authorization) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (tenant && !headers['X-Tenant-ID']) {
      headers['X-Tenant-ID'] = tenant;
    }

    const url = `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;

    const response = await fetch(url, {
      ...init,
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status} ${response.statusText}: ${text}`);
    }

    // Intentar JSON, si falla devolver texto
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json() as Promise<T>;
    }
    // @ts-ignore permitir texto o vacío
    return response.text() as T;
  }

  get<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    return this.request<T>(path, { ...init, method: 'GET' });
  }

  post<T = unknown, B = unknown>(path: string, body?: B, init: RequestInit = {}): Promise<T> {
    return this.request<T>(path, {
      ...init,
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : init.body
    });
  }

  put<T = unknown, B = unknown>(path: string, body?: B, init: RequestInit = {}): Promise<T> {
    return this.request<T>(path, {
      ...init,
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : init.body
    });
  }

  patch<T = unknown, B = unknown>(path: string, body?: B, init: RequestInit = {}): Promise<T> {
    return this.request<T>(path, {
      ...init,
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : init.body
    });
  }

  delete<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    return this.request<T>(path, { ...init, method: 'DELETE' });
  }
}


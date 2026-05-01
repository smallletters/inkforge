/**
 * 加密工具模块 - 用于安全存储API Keys等敏感信息
 * 使用AES-256-GCM算法
 * 作者: <smallletters@sina.com>
 */

import * as crypto from 'crypto';

export class Crypto {
  private key: Buffer;

  constructor(secretKey: string) {
    const keyHash = crypto.createHash('sha256').update(secretKey).digest();
    this.key = keyHash;
  }

  encrypt(text: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}|${encrypted}|${authTag}`;
  }

  decrypt(encryptedText: string): string {
    const [ivHex, encryptedHex, authTagHex] = encryptedText.split('|');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }
}

let cryptoInstance: Crypto | null = null;

export function initCrypto(secretKey: string): Crypto {
  cryptoInstance = new Crypto(secretKey);
  return cryptoInstance;
}

export function getCrypto(): Crypto {
  if (!cryptoInstance) {
    throw new Error('Crypto not initialized. Call initCrypto first.');
  }
  return cryptoInstance;
}

export function encrypt(text: string): string {
  return getCrypto().encrypt(text);
}

export function decrypt(encryptedText: string): string {
  try {
    if (!encryptedText.includes('|')) {
      const buffer = Buffer.from(encryptedText, 'base64');
      const text = buffer.toString('utf8');
      return text;
    }
    return getCrypto().decrypt(encryptedText);
  } catch {
    return Buffer.from(encryptedText, 'base64').toString('utf8');
  }
}

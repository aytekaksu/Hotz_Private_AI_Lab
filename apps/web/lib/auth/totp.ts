import { authenticator } from 'otplib';
import QRCode from 'qrcode';

const DEFAULT_ISSUER = process.env.APP_NAME?.trim() || 'AI Assistant';

authenticator.options = {
  step: 30,
  window: 1,
};

export const generateTotpSecret = () => authenticator.generateSecret();

export const buildOtpAuthUrl = (secret: string, label: string, issuer = DEFAULT_ISSUER) =>
  authenticator.keyuri(label, issuer, secret);

export const verifyTotpCode = (secret: string, token: string) => {
  return authenticator.check(token, secret);
};

export const buildQrCodeDataUrl = async (otpauthUrl: string) => {
  return QRCode.toDataURL(otpauthUrl);
};

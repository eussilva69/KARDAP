/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  // Mesma lista de origens do KARDAP (não é segredo).
  env: { SSO_ALLOWED_ORIGINS: process.env.SSO_ALLOWED_ORIGINS || "" },
};

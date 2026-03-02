// lib/auth.js - Middleware de seguridad
const keySecurityList = process.env.KEY_SECURITY_LIST 
  ? process.env.KEY_SECURITY_LIST.split(',').map(k => k.trim()) 
  : [];

export function validateSecurityKey(req, res) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return { valid: false, error: 'Falta header x-api-key' };
  }
  
  if (!keySecurityList.includes(apiKey)) {
    return { valid: false, error: 'API key inválida' };
  }
  
  return { valid: true };
}

/**
 * QR Code Generation Utility for SnapJe
 * 
 * Generates unique QR code data URLs from order qrCode strings.
 * Each QR code is generated ONCE and tied to a specific order.
 * The qrCode field (UUID) is set at order creation time and never changes.
 */

import QRCode from 'qrcode'

/**
 * Generate a QR code data URL from a qrCode string
 * @param qrCode - The unique QR code string (UUID) stored in the Order record
 * @param size - Width/height in pixels (default 256)
 * @returns Data URL string (e.g., "data:image/png;base64,...")
 */
export async function generateQRCodeDataURL(qrCode: string, size = 256): Promise<string> {
  try {
    const dataUrl = await QRCode.toDataURL(qrCode, {
      width: size,
      margin: 2,
      color: {
        dark: '#1a1c1e',   // Dark QR code
        light: '#ffffff',   // White background
      },
      errorCorrectionLevel: 'M', // Medium — good balance of readability and data density
    })
    return dataUrl
  } catch (error) {
    console.error('QR code generation error:', error)
    throw new Error('Failed to generate QR code')
  }
}

/**
 * Generate a QR code as a Uint8Array (for server-side use)
 */
export async function generateQRCodeBuffer(qrCode: string, size = 256): Promise<Uint8Array> {
  try {
    const buffer = await QRCode.toBuffer(qrCode, {
      width: size,
      margin: 2,
      color: {
        dark: '#1a1c1e',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
    return buffer
  } catch (error) {
    console.error('QR code buffer generation error:', error)
    throw new Error('Failed to generate QR code buffer')
  }
}

const sgMail = require('@sendgrid/mail');
const qrService = require('./qrcode');

// Configure SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const config = {
  fromEmail: process.env.SENDGRID_FROM_EMAIL || 'notificaciones@miscanchas.com',
  fromName: process.env.SENDGRID_FROM_NAME || 'MisCanchas',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4555'
};

/**
 * Send an email using SendGrid
 */
async function sendEmail(to, subject, html, text = null) {
  try {
    const msg = {
      to,
      from: {
        email: config.fromEmail,
        name: config.fromName
      },
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, '')
    };

    await sgMail.send(msg);
    console.log(`📧 Email sent to ${to}: ${subject}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    if (error.response) {
      console.error('SendGrid error details:', error.response.body);
    }
    return false;
  }
}

/**
 * Format date for display
 */
function formatDate(dateStr) {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('es-AR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Format currency
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0
  }).format(amount);
}

/**
 * Send booking confirmation email to client
 */
async function sendBookingConfirmation(booking, establishment, court) {
  const {
    id: bookingId,
    clientName,
    clientEmail,
    date,
    startTime,
    endTime,
    totalAmount,
    depositAmount,
    checkInCode,
    notes
  } = booking;

  if (!clientEmail) {
    console.log('⚠️ No client email provided, skipping confirmation email');
    return false;
  }

  const remainingAmount = totalAmount - (depositAmount || 0);
  const establishmentName = establishment?.name || 'el establecimiento';
  const courtName = court?.name || 'la cancha';
  const establishmentAddress = establishment?.address || '';
  const establishmentPhone = establishment?.phone || '';

  const subject = `Reserva confirmada · ${courtName} · ${formatDate(date)}`;

  // Logo URL - hosted on the platform (light theme logo)
  const logoUrl = 'https://www.miscanchas.com/assets/logos/logo-light.svg';

  // Generate QR URL for email - use PNG endpoint (emails need direct image URL)
  let qrImageUrl = null;
  if (bookingId) {
    // Use production API URL for emails
    const backendUrl = process.env.NODE_ENV === 'production' 
      ? 'https://api.miscanchas.com'
      : (process.env.NGROK_URL || 'http://localhost:8001');
    // Use .png endpoint which returns image directly (not JSON)
    qrImageUrl = `${backendUrl}/api/bookings/${bookingId}/qr.png`;
  }

  // Confirmation page URL
  const confirmationUrl = `${config.frontendUrl}/reservar/confirmacion/${bookingId}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reserva Confirmada</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f9fafb;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          
          <!-- Header with Logo -->
          <tr>
            <td style="padding: 32px 40px 24px; text-align: center; border-bottom: 1px solid #e5e7eb;">
              <img src="${logoUrl}" alt="MisCanchas" style="height: 40px; width: auto;" />
            </td>
          </tr>
          
          <!-- Success Badge -->
          <tr>
            <td style="padding: 32px 40px 0; text-align: center;">
              <div style="display: inline-block; background-color: #ecfdf5; border-radius: 100px; padding: 8px 20px;">
                <span style="color: #10b981; font-size: 14px; font-weight: 500;">✓ Reserva confirmada</span>
              </div>
            </td>
          </tr>
          
          <!-- Greeting -->
          <tr>
            <td style="padding: 24px 40px 0; text-align: center;">
              <p style="color: #111827; font-size: 20px; font-weight: 600; margin: 0 0 8px;">
                ¡Hola${clientName ? ', ' + clientName.split(' ')[0] : ''}!
              </p>
              <p style="color: #6b7280; font-size: 14px; margin: 0;">
                Tu cancha está reservada. Te enviamos los detalles.
              </p>
            </td>
          </tr>
          
          <!-- Booking Code -->
          <tr>
            <td style="padding: 24px 40px 0; text-align: center;">
              <p style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 6px;">Código de reserva</p>
              <p style="color: #111827; font-size: 24px; font-weight: 700; font-family: monospace; margin: 0;">${bookingId.slice(0, 8).toUpperCase()}</p>
            </td>
          </tr>
          
          <!-- Booking Details Card -->
          <tr>
            <td style="padding: 32px 40px;">
              <table role="presentation" style="width: 100%; background-color: #f9fafb; border-radius: 12px; border: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding: 24px;">
                    
                    <!-- Court & Establishment -->
                    <table role="presentation" style="width: 100%; margin-bottom: 20px;">
                      <tr>
                        <td>
                          <p style="color: #10b981; font-size: 18px; font-weight: 600; margin: 0 0 4px;">${courtName}</p>
                          <p style="color: #6b7280; font-size: 14px; margin: 0;">${establishmentName}</p>
                        </td>
                      </tr>
                    </table>
                    
                    <!-- Divider -->
                    <div style="height: 1px; background-color: #e5e7eb; margin: 0 0 20px;"></div>
                    
                    <!-- Date & Time Row -->
                    <table role="presentation" style="width: 100%;">
                      <tr>
                        <td style="width: 50%; vertical-align: top;">
                          <p style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 6px;">Fecha</p>
                          <p style="color: #111827; font-size: 15px; font-weight: 500; margin: 0;">${formatDate(date)}</p>
                        </td>
                        <td style="width: 50%; vertical-align: top;">
                          <p style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 6px;">Horario</p>
                          <p style="color: #111827; font-size: 15px; font-weight: 500; margin: 0;">${startTime} - ${endTime}</p>
                        </td>
                      </tr>
                    </table>
                    
                    ${establishmentAddress ? `
                    <!-- Address -->
                    <table role="presentation" style="width: 100%; margin-top: 16px;">
                      <tr>
                        <td>
                          <p style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 6px;">Dirección</p>
                          <p style="color: #374151; font-size: 14px; margin: 0;">${establishmentAddress}</p>
                        </td>
                      </tr>
                    </table>
                    ` : ''}
                    
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Payment Summary -->
          <tr>
            <td style="padding: 0 40px 32px;">
              <table role="presentation" style="width: 100%; background-color: #f9fafb; border-radius: 12px; border: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding: 20px 24px;">
                    <table role="presentation" style="width: 100%;">
                      <tr>
                        <td style="color: #6b7280; font-size: 14px; padding: 4px 0;">Total de la reserva</td>
                        <td style="color: #111827; font-size: 14px; padding: 4px 0; text-align: right;">${formatCurrency(totalAmount)}</td>
                      </tr>
                      ${depositAmount ? `
                      <tr>
                        <td style="color: #10b981; font-size: 14px; padding: 4px 0;">Seña abonada</td>
                        <td style="color: #10b981; font-size: 14px; padding: 4px 0; text-align: right;">- ${formatCurrency(depositAmount)}</td>
                      </tr>
                      <tr>
                        <td colspan="2" style="padding: 12px 0 0;">
                          <div style="height: 1px; background-color: #e5e7eb;"></div>
                        </td>
                      </tr>
                      <tr>
                        <td style="color: #111827; font-size: 16px; font-weight: 600; padding: 12px 0 0;">A pagar en el lugar</td>
                        <td style="color: #111827; font-size: 18px; font-weight: 700; padding: 12px 0 0; text-align: right;">${formatCurrency(remainingAmount)}</td>
                      </tr>
                      ` : `
                      <tr>
                        <td colspan="2" style="padding: 12px 0 0;">
                          <div style="height: 1px; background-color: #e5e7eb;"></div>
                        </td>
                      </tr>
                      <tr>
                        <td style="color: #10b981; font-size: 14px; font-weight: 500; padding: 12px 0 0;">Estado</td>
                        <td style="color: #10b981; font-size: 14px; font-weight: 600; padding: 12px 0 0; text-align: right;">Pagado ✓</td>
                      </tr>
                      `}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          ${qrImageUrl ? `
          <!-- QR Code Section -->
          <tr>
            <td style="padding: 0 40px 32px; text-align: center;">
              <table role="presentation" style="width: 100%; background-color: #f9fafb; border-radius: 12px; border: 1px solid #e5e7eb;">
                <tr>
                  <td style="padding: 24px; text-align: center;">
                    <p style="color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 16px;">Código QR para check-in</p>
                    <div style="background-color: #ffffff; padding: 12px; border-radius: 12px; display: inline-block; border: 1px solid #e5e7eb;">
                      <img src="${qrImageUrl}" alt="QR Code" style="width: 150px; height: 150px;" />
                    </div>
                    <p style="color: #6b7280; font-size: 12px; margin: 16px 0 0;">Mostrá este código en el establecimiento para iniciar tu turno</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ` : ''}
          
          <!-- View Booking Button -->
          <tr>
            <td style="padding: 0 40px 32px; text-align: center;">
              <a href="${confirmationUrl}" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 14px;">Ver mi reserva</a>
            </td>
          </tr>
          
          <!-- Info Box -->
          <tr>
            <td style="padding: 0 40px 32px;">
              <table role="presentation" style="width: 100%; background-color: #eff6ff; border-radius: 12px; border: 1px solid #bfdbfe;">
                <tr>
                  <td style="padding: 16px 20px;">
                    <p style="color: #1d4ed8; font-size: 13px; margin: 0;">
                      <strong>Recordá:</strong> Presentate 10 minutos antes de tu turno. El saldo restante se abona en el establecimiento.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${establishmentPhone ? `
          <!-- Contact -->
          <tr>
            <td style="padding: 0 40px 32px; text-align: center;">
              <p style="color: #6b7280; font-size: 13px; margin: 0;">
                ¿Consultas? <a href="tel:${establishmentPhone}" style="color: #10b981; text-decoration: none;">${establishmentPhone}</a>
              </p>
            </td>
          </tr>
          ` : ''}
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                © ${new Date().getFullYear()} MisCanchas · Reservá tu cancha online
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return sendEmail(clientEmail, subject, html);
}

/**
 * Send booking notification to establishment
 */
async function sendEstablishmentNotification(booking, establishment, court) {
  const establishmentEmail = establishment?.email;
  
  if (!establishmentEmail) {
    console.log('⚠️ No establishment email, skipping notification');
    return false;
  }

  const {
    clientName,
    clientEmail,
    clientPhone,
    date,
    startTime,
    endTime,
    totalAmount,
    depositAmount
  } = booking;

  const courtName = court?.name || 'Cancha';
  const remainingAmount = totalAmount - (depositAmount || 0);

  const subject = `🆕 Nueva reserva - ${courtName} - ${formatDate(date)} ${startTime}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Nueva Reserva</title>
</head>
<body style="margin: 0; padding: 20px; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <table style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; padding: 30px;">
    <tr>
      <td>
        <h2 style="color: #10b981; margin: 0 0 20px;">🆕 Nueva Reserva Recibida</h2>
        
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #eee;"><strong>Cancha:</strong></td>
            <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${courtName}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #eee;"><strong>Fecha:</strong></td>
            <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${formatDate(date)}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #eee;"><strong>Horario:</strong></td>
            <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${startTime} - ${endTime}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #eee;"><strong>Cliente:</strong></td>
            <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${clientName || 'No especificado'}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #eee;"><strong>Email:</strong></td>
            <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${clientEmail || 'No especificado'}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #eee;"><strong>Teléfono:</strong></td>
            <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${clientPhone || 'No especificado'}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #eee;"><strong>Total:</strong></td>
            <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${formatCurrency(totalAmount)}</td>
          </tr>
          ${depositAmount ? `
          <tr>
            <td style="padding: 10px 0; border-bottom: 1px solid #eee;"><strong>Seña pagada:</strong></td>
            <td style="padding: 10px 0; border-bottom: 1px solid #eee; color: #10b981;">${formatCurrency(depositAmount)}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0;"><strong>Pendiente:</strong></td>
            <td style="padding: 10px 0; color: #dc2626; font-weight: bold;">${formatCurrency(remainingAmount)}</td>
          </tr>
          ` : ''}
        </table>
        
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
          Este email fue generado automáticamente por MisCanchas.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  return sendEmail(establishmentEmail, subject, html);
}

module.exports = {
  sendEmail,
  sendBookingConfirmation,
  sendEstablishmentNotification,
  formatDate,
  formatCurrency
};

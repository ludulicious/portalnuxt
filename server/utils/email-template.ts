const BRAND_NAME = 'PortalNuxt'
const TAGLINE = 'Your portal, managed.'

export function escapeEmailHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function absoluteAssetUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, '')}${path}`
}

export function portalEmailButton(label: string, url: unknown) {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0"><tr><td style="border-radius:8px;background:#2563eb"><a href="${escapeEmailHtml(url)}" style="display:inline-block;padding:13px 20px;font-family:Arial,sans-serif;font-size:15px;font-weight:700;line-height:20px;color:#ffffff;text-decoration:none">${escapeEmailHtml(label)}</a></td></tr></table>`
}

export function renderPortalEmail(content: string) {
  const platformUrl = String(useRuntimeConfig().public.platformUrl || 'http://localhost:3000')
  const logoUrl = absoluteAssetUrl(platformUrl, '/images/nuxt-customer-portal-logo-light.webp')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${BRAND_NAME}</title>
</head>
<body style="margin:0;padding:0;background:#f3f6fb;color:#172033">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${TAGLINE}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f3f6fb">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px">
        <tr><td style="padding:0 4px 20px">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
            <td style="padding-right:12px"><img src="${escapeEmailHtml(logoUrl)}" width="48" height="48" alt="" style="display:block;width:48px;height:48px;border:0"></td>
            <td><div style="font-family:Arial,sans-serif;font-size:21px;font-weight:800;line-height:24px;color:#111827">${BRAND_NAME}</div><div style="padding-top:3px;font-family:Arial,sans-serif;font-size:13px;line-height:18px;color:#64748b">${TAGLINE}</div></td>
          </tr></table>
        </td></tr>
        <tr><td style="border:1px solid #dbe3ef;border-radius:14px;background:#ffffff;padding:40px 44px;font-family:Arial,sans-serif;font-size:16px;line-height:26px;color:#334155">
          ${content}
          <div style="margin-top:32px;padding-top:24px;border-top:1px solid #e5eaf1">
            <p style="margin:0">Kind regards,<br><strong style="color:#172033">The PortalNuxt team</strong></p>
          </div>
        </td></tr>
        <tr><td align="center" style="padding:20px 20px 0;font-family:Arial,sans-serif;font-size:12px;line-height:18px;color:#7c8799">
          PortalNuxt is operated by Ludulicious B.V.<br>${TAGLINE}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

/** Plain-text content of the downloadable recovery-code file (one code per line). */
export function recoveryCodesFileText(codes: string[], email: string): string {
  const lines = [
    'LukiFitti — Two-factor recovery codes',
    `Account: ${email}`,
    '',
    'Each code works exactly once, in place of the 6-digit app code.',
    'Store them somewhere safe — they are not shown again.',
    '',
    ...codes,
    '',
  ];
  return lines.join('\n');
}

/** Triggers a `.txt` download for the recovery codes (object URL, revoked right after). */
export function downloadRecoveryCodes(codes: string[], email: string): void {
  const blob = new Blob([recoveryCodesFileText(codes, email)], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lukifitti-recovery-codes.txt';
  a.click();
  URL.revokeObjectURL(url);
}

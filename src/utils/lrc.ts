// LRC 解析
export interface LyricLine {
  time: number;
  text: string;
}

export function parseLRC(text: string | null | undefined): LyricLine[] {
  if (!text) return [];
  const lines: LyricLine[] = [];
  const re = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
  text.split(/\r?\n/).forEach(line => {
    const text = line.replace(/\[[\d:.]+\]/g, '').trim();
    if (!text) return;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(line)) !== null) {
      const time = parseInt(m[1]) * 60 + parseFloat(m[2]);
      lines.push({ time, text });
    }
  });
  return lines.sort((a, b) => a.time - b.time);
}

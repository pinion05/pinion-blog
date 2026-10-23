// embeds/mermaid-init.js — mermaid 초기화 (다크 테마)
if (window.mermaid) {
  mermaid.initialize({ startOnLoad: true, theme: 'base', securityLevel: 'loose',
    themeVariables: { primaryColor: '#e8ecff', primaryBorderColor: '#000080', primaryTextColor: '#101060',
      lineColor: '#000080', secondaryColor: '#fff3cd', tertiaryColor: '#f4f1e8', fontSize: '14px' },
    flowchart: { curve: 'basis' } });
}

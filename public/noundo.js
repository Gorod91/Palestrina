// "Agita per annullare" di iPhone: dopo aver scritto in un campo, scuotendo il telefono (anche per fermare il timer)
// iOS chiede "Annulla inserimento". Un'app web non può spegnerlo, ma la domanda compare solo se c'è qualcosa da
// annullare: quando si esce da un campo si svuota la cronologia di annullamento della pagina. Safari la svuota
// quando il valore di un campo cambia da codice, quindi basta cambiare due volte una casella nascosta.

let sink = null;

function clearUndo() {
  if (!sink) {
    sink = document.createElement('input');
    sink.tabIndex = -1;
    sink.setAttribute('aria-hidden', 'true');
    sink.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.appendChild(sink);
  }
  sink.value = 'x';
  sink.value = '';
}

const editable = (el) => el && (el.isContentEditable || el.tagName === 'TEXTAREA'
  || (el.tagName === 'INPUT' && !['checkbox', 'radio', 'range', 'button', 'submit', 'file', 'color'].includes(el.type)));

export function initNoUndo() {
  document.addEventListener('focusout', (ev) => {
    if (!editable(ev.target) || ev.target === sink) return;
    // dopo che l'app ha salvato e ridisegnato; se intanto si è entrati in un altro campo lo si lascia stare
    setTimeout(() => { if (!editable(document.activeElement)) clearUndo(); }, 0);
  }, true);
}

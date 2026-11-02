// Schermo acceso mentre c'è un timer: timer addominali, recupero ed esercizi a tempo della scheda, circuito guidato
// e lampeggio di fine tempo. Ogni parte dice se le serve (setAwake('nome', true/false)); lo schermo resta acceso
// finché almeno una lo chiede. Su iPhone serve iOS 16.4 (nell'app sulla Home da iOS 18.4); altrove non fa niente.

const reasons = new Set();
let lock = null;
let asking = false;

async function sync() {
  if (!('wakeLock' in navigator)) return;
  const want = reasons.size > 0 && document.visibilityState === 'visible';
  if (want && !lock && !asking) {
    asking = true;
    try {
      const l = await navigator.wakeLock.request('screen');
      l.addEventListener('release', () => { if (lock === l) lock = null; });
      lock = l;
    } catch { /* non supportato o negato: pazienza */ }
    asking = false;
    if (!reasons.size && lock) sync(); // nel frattempo i timer si sono fermati
  } else if (!want && lock && document.visibilityState === 'visible') {
    const l = lock;
    lock = null;
    l.release().catch(() => {});
  }
}

export function setAwake(reason, on) {
  if (on) reasons.add(reason);
  else reasons.delete(reason);
  sync();
}

/** Tiene acceso lo schermo finché l'elemento è visibile (attributo hidden assente). */
export function awakeWhileShown(reason, el) {
  const upd = () => setAwake(reason, !el.hidden);
  new MutationObserver(upd).observe(el, { attributes: true, attributeFilter: ['hidden'] });
  upd();
}

// Uscendo dall'app iOS toglie il blocco: tornando, se c'è ancora un timer, si richiede.
document.addEventListener('visibilitychange', sync);

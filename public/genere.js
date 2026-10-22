// Testi al femminile per chi ha "f" nella colonna Sesso del foglio Utenti (oggi Michy).
// Solo dove si parla di una persona precisa: le regole e i testi generici restano come sono.

const AL_F = {
  Mattiniero: 'Mattiniera',
  'Appena tiepido': 'Appena tiepida',
  'Fresco come una rosa': 'Fresca come una rosa',
};

/** Titolo (traguardo, Sudometro) al femminile se `f`; anche quelli già salvati. */
export const alF = (txt, f) => (f && AL_F[txt]) || txt;

/** "Re del mese", "Regina del mese" o, con un pari merito misto, "Re e Regina del mese". */
export function kingTitle(names, isF) {
  const n = names.filter(isF).length;
  return n === 0 ? 'Re del mese' : n === names.length ? 'Regina del mese' : 'Re e Regina del mese';
}

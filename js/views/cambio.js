// Cambio guidato del giornale elettronico (DGFE / MPD), con le immagini di EpsonFpWizard.
// La formattazione (3097) è possibile solo quando la stampante segnala «DGFE da formattare».

import { $, $$, esc, toast, confirmBox, task, fresh } from '../ui.js';
import { current, cache, saveCache, call, ensureDayClosed } from '../state.js';
import { mixedWarning } from './general.js';
import * as fp from '../fpmate.js';
import * as C from '../commands.js';

const STEPS = (nativo) => [
  { id: 'z', title: 'Chiusura giornaliera', text: 'Esegui la chiusura giornaliera prima di sostituire la memoria. Il pulsante la esegue solo se la giornata risulta aperta.', action: 'z' },
  { id: 'off', title: 'Spegni la stampante', text: 'Spegni la stampante e stacca la spina di alimentazione.' },
  ...(nativo ? [{ id: 'seal', title: 'Rimozione sigillo', text: 'Svita le due viti con testa a croce e rimuovi il sigillo fiscale posto sul retro della stampante.', img: 'sigillo' }] : []),
  { id: 'out', title: 'Estrazione della memoria', text: nativo
    ? 'Solleva leggermente il fermo in plastica posto sul retro, poi spingi la memoria e rilasciala fino all\'espulsione.'
    : 'Rimuovi il coperchio di plastica sul retro, ruota la manopola che impedisce la fuoriuscita della memoria, poi spingi la memoria e rilasciala fino all\'espulsione.', img: 'estrazione' },
  { id: 'swap', title: 'Sostituzione', text: 'Verifica che sull\'etichetta della memoria esaurita siano riportati data di inizializzazione, matricola fiscale e numero progressivo. Prepara la nuova memoria applicando l\'etichetta fornita e scrivendo data, matricola e numero progressivo.', img: 'cambio' },
  { id: 'in', title: 'Inserimento della nuova memoria', text: 'Inserisci la nuova memoria al posto della precedente fino a sentire lo scatto del bloccaggio e rimetti la stampante in posizione di lavoro.', img: 'inserimento' },
  { id: 'on', title: 'Accensione', text: 'Accendi la stampante: il visore mostra ATTENDERE e poi DGFE DA FORMATTARE. Il controllo della memoria può richiedere alcuni minuti: NON spegnere la stampante. Poi premi «Verifica stato».', action: 'check' },
  { id: 'fmt', title: 'Formattazione', text: 'Formatta la nuova memoria. Al termine la stampante emette un documento riassuntivo da conservare con i documenti della stampante. Su alcuni modelli la formattazione va eseguita da tastiera.', action: 'format' },
  { id: 'end', title: 'Chiusura dell\'intervento', text: `${nativo ? 'Rimonta il sigillo fiscale e applica il tuo bollo. ' : ''}Registra l'intervento 02 (sostituzione del DGFE) sul libretto elettronico nel portale dell'Agenzia delle Entrate.` },
];

export function cambio(main) {
  main = fresh(main);
  const p = current();
  if (!p) {
    main.innerHTML = '<div class="card empty">Nessuna stampante selezionata.<div class="actions" style="justify-content:center"><a class="btn" href="#/printer/new">Aggiungi stampante</a></div></div>';
    return;
  }
  const c = cache();
  const S = (c.cambio ||= { done: {}, ej: null, family: null });
  const model = c.serial?.ok ? c.serial.model : null;
  if (!S.family) S.family = model && ['EX', 'EY'].includes(model) ? 'modificati' : 'nativi';
  const nativo = S.family === 'nativi';
  const steps = STEPS(nativo);
  const canFormat = S.ej === '2';

  main.innerHTML = `
    ${mixedWarning(p)}
    <section class="card">
      <h2>Cambio giornale elettronico (DGFE)</h2>
      <div class="segment" style="margin-top:.4rem">
        <button data-fam="nativi" class="${nativo ? 'on' : ''}">RT nativi e Server RT</button>
        <button data-fam="modificati" class="${!nativo ? 'on' : ''}">RT modificati / MF</button>
      </div>
      <p class="muted" style="font-size:.85rem;margin-top:.6rem">${model ? `Modello rilevato: ${esc(C.MODELS[model] || model)}.` : 'Modello non ancora letto (sezione Stato e info).'}
        Stato giornale elettronico: <b>${S.ej == null ? 'non letto' : esc(C.decodeFpStatus(`0${S.ej}110`)[1][1])}</b></p>
    </section>
    ${steps.map((s, i) => `
      <section class="card">
        <div class="row between"><h2 style="margin:0">${i + 1}. ${esc(s.title)}</h2>
          <label class="check" style="padding:0"><input type="checkbox" data-done="${s.id}" ${S.done[s.id] ? 'checked' : ''}> fatto</label></div>
        <p>${esc(s.text)}</p>
        ${s.img ? `<div class="logo-preview"><img src="assets/cambio/${S.family}/${s.img}.jpg" alt="${esc(s.title)}" style="max-width:100%;height:auto" onerror="this.parentElement.remove()"></div>` : ''}
        ${s.action === 'z' ? '<div class="actions"><button class="btn secondary" data-act="z">Esegui chiusura se necessaria</button></div>' : ''}
        ${s.action === 'check' ? '<div class="actions"><button class="btn secondary" data-act="check">Verifica stato</button></div>' : ''}
        ${s.action === 'format' ? `<div class="actions"><button class="btn danger" data-act="format" ${canFormat ? '' : 'disabled'}>Formatta nuovo DGFE</button></div>
          ${canFormat ? '' : '<p class="muted" style="font-size:.85rem">Il pulsante si attiva quando la verifica dello stato indica «Da formattare».</p>'}` : ''}
      </section>`).join('')}`;

  $$('[data-fam]', main).forEach((b) => b.addEventListener('click', () => { S.family = b.dataset.fam; saveCache(); cambio(main); }));
  $$('[data-done]', main).forEach((cb) => cb.addEventListener('change', () => { S.done[cb.dataset.done] = cb.checked; saveCache(); }));
  const check = async () => {
    const st = await call((pr) => fp.queryStatus(pr, 0));
    S.ej = String(st.fpStatus || '')[1] ?? null;
    saveCache();
    return S.ej;
  };
  $$('[data-act]', main).forEach((b) => b.addEventListener('click', async () => {
    const act = b.dataset.act;
    if (act === 'z') {
      await task('Verifica giornata…', async () => {
        if (await ensureDayClosed(p, 'sostituire il giornale elettronico')) { S.done.z = true; saveCache(); toast('Giornata chiusa', 'ok'); }
      });
    } else if (act === 'check') {
      await task('Verifica stato…', async () => {
        const ej = await check();
        toast(`Giornale elettronico: ${C.decodeFpStatus(`0${ej}110`)[1][1]}`, ej === '2' ? 'ok' : 'warn');
        if (ej === '2') { S.done.on = true; saveCache(); }
      });
    } else if (act === 'format') {
      if (!await confirmBox('Formatta nuovo DGFE', 'Formattare la memoria appena inserita? Procedi solo dopo aver inserito una memoria NUOVA: l\'operazione non è reversibile.', { okText: 'Formatta', danger: true })) return;
      await task('Formattazione in corso (alcuni minuti, non spegnere la stampante)…', async () => {
        if (await check() !== '2') throw new Error('La stampante non segnala «DGFE da formattare»: formattazione annullata');
        await call((pr) => fp.directIO(pr, '3097', '01', { timeout: 600000, label: 'Formattazione DGFE' }));
        const ej = await check();
        S.done.fmt = ej === '0'; saveCache();
        toast(ej === '0' ? 'DGFE formattato: stato OK' : `Formattazione inviata, stato: ${C.decodeFpStatus(`0${ej}110`)[1][1]}`, ej === '0' ? 'ok' : 'warn');
      });
    }
    cambio(main);
  }));
}

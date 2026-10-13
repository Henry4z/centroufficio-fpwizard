# FP Wizard – PWA per stampanti fiscali Epson RT · Centro Ufficio Padova

Grafica nello stile di [centroufficiopadova.it](https://centroufficiopadova.it/): logo Centro Ufficio, rosso #F42D4C, carattere Lato. Le icone dell'app sono ricavate dal logo quadrato del sito.

App web installabile (PWA) per configurare le stampanti fiscali **Epson FP-81 II RT, FP-90 III RT e Server RT** da iPhone, Android o PC, senza driver: comunica via rete con il servizio `fpmate.cgi` integrato nella stampante, usando i comandi nativi Epson (Direct IO).

## Funzioni

| Sezione | Cosa fa | Comandi |
|---|---|---|
| Collega stampante (`…/collega`, anche `…/collega?ip=192.168.1.100`) | Si scrive l'IP e l'app crea la stampante, prova HTTPS (e HTTP dalla versione locale), guida all'accettazione del certificato Epson e completa il collegamento da sola, dando alla stampante nome e matricola letti da essa | `queryPrinterStatus`, 3217 |
| Sincronizza tutto (schermata iniziale) | Legge in una volta tutte le sezioni scelte e aggiorna i dati di ogni schermata. Le sezioni sono stato, programmazione, tabelle, altre impostazioni, IVA/nature/ATECO, rete e servizi, tastiera, tasti PLU, trasmissioni, scheda SD e contatori; i PLU sono facoltativi. Fa solo letture, si può interrompere e lascia intatte le modifiche non ancora scritte. Su una FP-81 II RT dura circa un minuto e mezzo | solo comandi di lettura |
| Stato e info | Stato stampante e RT, matricola, firmware, data/ora (lettura e sincronizzazione con il telefono), apertura cassetto, messaggio visore, reset | `queryPrinterStatus`, 3217, `getDate`/`setDate`, 1050 |
| Intestazione | 16 righe da 40 caratteri, font righe 1–9, anteprima, stampa di prova | 3016/3216, 4016/4216 |
| Aliquote IVA | Gruppi 1–9 | 4005/4205 |
| Reparti | Descrizione, prezzi, IVA/natura, limite, beni/servizi, articolo singolo, gruppo stampa, ATECO… | 4002/4202 |
| Flag SET 14 | 68 flag con descrizioni e avvisi sui flag critici | 4014/4214 |
| Parametri SET 15 | 29 parametri (larghezza carta, numero cassa, loghi, timeout RT…) | 4015/4215 |
| Operatori e pagamenti | Operatori (nome, password, commissione), carte di credito, ticket, gruppi merceologici | 4013/4213, 4007/4207, 4010/4210, 4008/4208 |
| Loghi | 9 loghi standard Epson (80 e 58 mm), loghi personalizzati da qualsiasi immagine (conversione in bianco/nero), posizione header/footer | `setLogo` |
| Verificazione periodica | Visita fiscale guidata in 13 passi: controlli preliminari, verifica visiva (visore, cassetto), orologio, test di rete e server AdE, stampa diagnostica, documenti di prova (vendita + annullo, vendita elettronica + reso, codice lotteria facoltativo) anche in modalità simulazione, chiusura Z, registrazione dell'intervento (codici AdE 03/04/05, più 01/02/06 se serve) con «CHIUSURA VP», ristampa MPD, stampa MPR, data prossima VP, riepilogo stampato e rapporto salvato sul telefono | `printerFiscalReceipt`, 4020, 4028/4228, 3012, 4038, `printContentByNumbers` |
| Giornale elettronico | DGFE/MPD per date o numeri: lettura e salvataggio sul telefono (.txt), ricerca nel testo, ristampa su carta, ristampa ultimo documento; memoria fiscale (MPR) per numeri Z, per date, totali, completa | `queryContentBy…`, `printContentBy…`, 3012–3015 |
| Totalizzatori | Grand totali, reparti (pezzi e importi: vendite, resi, annulli, acconti, omaggi, buoni), IVA (imponibile/imposta), pagamenti e contatori; giornalieri o periodici; esportazione CSV | 2050, 2051, 2052 |
| Altre impostazioni | Parametri fattura e messaggi di cortesia, contanti con descrizione, importi predefiniti e limite contante, chiusura giornaliera automatica, messaggi lotteria, data di partenza della lotteria istantanea | 4025/4225, 4027/4227, 4053/4253, 4009/4209, 9013/9213, 9019/9219, 4040/4240 |
| IVA, nature e ATECO | IVA calendarizzate (nuove aliquote da una data, ventilazione), IVA storiche per resi/annulli, nature 15–18 (solo se ufficiali), codici ATECO 1–3 con ventilazione | 4055/4255, 9012/9212, 9004/9204, 4037/4237 |
| Rete e servizi | Rete LAN/Wi-Fi in sola lettura; web server (SSL/HTTPS, WebSocket, CORS, utente e password), PHP, Samba, web application, JSON, programma in background, lettore codici; e-mail (server SMTP, mittente, destinatari, formato); EFT-POS (protocollo, IP, porta, terminale, copie); accesso ai dati riservati (durata sessione, e-mail di recupero, accesso/uscita, password, e-mail di prova) | 4219, 4034/4234, 4032/4232, 4031/4231, 4038/4238, `rebootWebServer` |
| Trasmissioni AdE | Esito dell'invio dei corrispettivi per ogni Z (ID operazione e data di risposta), file da inviare/in ritardo/rifiutati, coda della lotteria e codici della lotteria istantanea, ricerca dello stato di un documento lotteria, stato E-Receipt e modalità di emissione, archiviazione dei file rifiutati | 9217, 1134, 9218, 1131, 9016 |
| Moduli tecnico | Comunicazione di messa in servizio o di defiscalizzazione/cessione, con modello, matricola, azzeramenti, scadenza VP, ditta e P.IVA letti dalla stampante; stampa A4 o PDF e salvataggio come testo | 3217, 2052, 4228, 3216 |
| PLU | PLU interni con descrizione, 3 prezzi, reparto e codice a barre; tasti PLU diretti 1–70 | 4003/4203, 4012/4212 |
| Tastiera | Come «Programmazione Tasti» del wizard: scelta della tastiera (32, 23/24, 56/60 tasti o griglia QWERTY), tasti disegnati, tocco sul tasto e scelta della funzione, tasti riprogrammati in rosso, valori predefiniti, salvataggio e caricamento da file | 4029/4229 |
| Simulatore cassa | Documenti commerciali, resi, annulli (con riferimento), fatture dirette, documenti gestionali | `printerFiscalReceipt`, `printerFiscalDocument` |
| Cambio DGFE | Procedura guidata con immagini (RT nativi / modificati), chiusura, verifica stato e formattazione abilitata solo con «DGFE da formattare» | 3097 |
| Diagnostica | Test di rete, partizioni della scheda SD, contatori di manutenzione (sola lettura: carta/coperchio; righe, testina, tagli e ore sulla FP-90 III RT), reset, riavvio web server | 4020, 1136, 4295, `rebootWebServer` |
| Rapporti | Lettura X, letture X per reparti/PLU/fasce orarie/operatori (giornaliere e periodiche), chiusura Z, X+Z, stampa di prova | `printerFiscalReport`, 2003–2012 |
| Backup e ripristino | Salva la programmazione in un file JSON e la riprogramma (anche su un'altra stampante). Importa anche i file di EpsonFpWizard per Windows (`DatiProgrammazione\*.xml`) | — |
| Direct IO | Console per comandi nativi, login gestione accesso, XML libero | — |
| Registro | Richieste e risposte complete, copiabili per l'assistenza | — |

Prima di ogni programmazione che lo richiede (intestazione, IVA, reparti, data) l'app verifica che la giornata sia chiusa e, se serve, propone la chiusura Z.

C'è anche un **simulatore** per provare l'app senza stampante (Home › "Prova con il simulatore").

## Requisiti della stampante

- Porta LAN o Wi-Fi configurata (3333 + CHIAVE + 19) e telefono sulla stessa rete.
- Web server della stampante raggiungibile: `http://IP-STAMPANTE/www/printer_status/get_status.html` deve aprirsi da Safari.

## Come usarla da iPhone

Safari blocca le chiamate da una pagina **HTTPS** verso un indirizzo **HTTP**: app e stampante devono usare lo stesso tipo di connessione.

**A. App pubblicata in HTTPS (es. GitHub Pages) + SSL attivo sulla stampante** – consigliata per i tecnici
1. Sulla stampante: 3333 + CHIAVE + 34 › WEB SERVER › SSL = 1, poi riavviare.
2. Su iPhone apri una volta `https://IP-STAMPANTE` in Safari e accetta il certificato.
3. Nell'app, nella scheda della stampante scegli il protocollo **HTTPS**.

**B. App servita in HTTP dalla rete locale** – nessun certificato
1. Sul PC (serve Node.js): doppio clic su `Avvia FP Wizard.cmd` (oppure `node serve.js` dentro questa cartella) e lascia aperta la finestra. La prima volta Windows può chiedere di consentire l'accesso di rete a Node.js: scegli **Reti private** e **Consenti**, altrimenti l'iPhone non riesce a collegarsi.
2. Su iPhone apri `http://IP-DEL-PC:8080/` (l'indirizzo viene stampato all'avvio).

**C. App caricata sulla stampante stessa**
Carica la cartella come web application (`/www/webapp`, tramite `http://IP-STAMPANTE/cgi-bin/upload.cgi`) e aprila da `http://IP-STAMPANTE/www/webapp/index.html`.

In tutti i casi, per installarla: Safari › **Condividi** › **Aggiungi alla schermata Home**.

### Pubblicare su GitHub Pages
1. Crea un repository e carica il contenuto di questa cartella (non serve alcuna compilazione). Il file `.gitignore` esclude i file di Epson (loghi standard `assets/logos/*.bin` e foto del cambio DGFE `assets/cambio/`): nella versione online quelle due parti mostrano un avviso, mentre la versione servita dal PC le ha complete.
2. Settings › Pages › Deploy from branch › `main` / root.
3. L'app sarà su `https://TUO-UTENTE.github.io/NOME-REPO/` e funzionerà anche offline (service worker).
4. Dalla versione HTTPS le stampanti vanno impostate in **HTTPS** (SSL attivo, vedi opzione A): il browser blocca le richieste HTTP verso la stampante.

## Note tecniche e limiti

- I tracciati dei comandi sono ricostruiti dalla documentazione pubblica Epson (ePOS Fiscal Print Development Guide, guida EpsonFp2 OCX, Manuale Operatore). Prima di scrivere, l'app **legge** sempre i dati e controlla che la risposta corrisponda al tracciato atteso; in caso contrario la modifica viene disattivata (es. reparti con "formato?").
- **Provare prima su una stampante non in produzione** e fare un backup. In caso di errori, la sezione Registro contiene richieste e risposte complete.
- I formati di lettura delle nuove sezioni (tastiera, nature, ATECO, IVA calendarizzate e storiche, EFT-POS, e-mail, parametri Intelligent, accesso, trasmissioni, gruppi merceologici, tasti PLU, contatori) sono stati verificati su una FP-81 II RT; le scritture ripetono il tracciato letto e vengono sempre rilette per conferma. Le nature 15–18 si scrivono come numero + simbolo (2) + descrizione (40) + codice AdE (5): la rilettura controlla che la stampante le abbia registrate così.
- La tabella dei tasti (codice → tasto sulle tastiere 32, 23/24 e 56/60 e funzione predefinita) è quella usata da EpsonFpWizard per Windows; i valori di fabbrica dei 256 codici coincidono con quelli letti dalla stampante.
- Non sono gestiti (rispetto all'EpsonFpWizard per Windows):
  - parametri LAN/Wi-Fi, che Epson non consente di programmare via rete;
  - invio effettivo dell'intervento tecnico tramite RT: il comando Epson `setRTServiceEvent` è riservato/NDA. Finché non viene configurato in `js/commands.js` → `SERVICE_EVENT`, l'app controlla e salva i dati e l'intervento va registrato sul libretto elettronico;
  - URL di certificati, NTP e ora legale, criteri della lotteria e aggiornamento firmware, che sono funzioni riservate o con licenza Epson;
  - promozioni, valute estere e «scontrino sicuro»: sono comandi obsoleti, che sulla stampante RT rispondono «non previsto»;
  - esportazione su chiavetta USB o scheda SD.

  Si possono comunque inviare i relativi comandi dalla console Direct IO.

## Struttura

```
index.html, manifest.webmanifest, sw.js   app e installazione PWA
css/app.css                               stile (tema chiaro/scuro, iPhone)
js/fpmate.js                              comunicazione con fpmate.cgi
js/commands.js                            tracciati comandi, flag, parametri, errori
js/simulator.js                           stampante simulata
js/logo.js                                conversione immagini e loghi raster
js/keyboards.js                           tastiere, codici tasto e funzioni (dal wizard Epson)
js/sync.js                                «Sincronizza tutto»: letture di tutte le sezioni
js/views/*.js                             schermate (prog.js: lettura/scrittura con verifica comuni)
assets/logos/                             loghi standard Epson (raster, modelli RT)
assets/brand/                             logo Centro Ufficio (dal sito); icons/ ne contiene le icone
serve.js                                  server locale (opzione B)
```

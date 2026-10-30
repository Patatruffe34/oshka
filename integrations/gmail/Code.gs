/** Oshka Gmail add-on. Only the current message is read, on user interaction. */
var OSHKA_ORIGIN = "https://<project>.web.app";
var OSHKA_TOKEN_KEY = "oshka_inbox_token_v1";

function onGmailHomepage() {
  if (!token_()) return connectionCard_();
  return card_("Oshka", "Gmail → Inbox", CardService.newCardSection()
    .addWidget(paragraph_("Ouvre un mail avec ce panneau actif : il sera ajouté automatiquement à ton Inbox, avec son objet, son expéditeur, un extrait et son lien. Ferme le panneau Oshka pour arrêter la capture automatique."))
    .addWidget(openOshka_()));
}

function onGmailMessageOpen(e) {
  if (!token_()) return connectionCard_();
  var mail;
  try { mail = readMail_(e); }
  catch (_error) { return card_("Oshka", "Accès au mail", CardService.newCardSection().addWidget(paragraph_("Réouvre le mail, puis le module Oshka pour renouveler l’accès au message."))); }
  return captureCard_(mail);
}

function connectOshka(e) {
  var code = input_(e, "code").trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(code)) return notice_("Colle le code de 32 caractères créé dans Oshka.");
  try {
    var result = api_("connect", { code: code });
    if (!result || !/^[a-f0-9]{64}$/.test(result.token)) throw new Error("invalid_response");
    PropertiesService.getUserProperties().setProperty(OSHKA_TOKEN_KEY, result.token);
  } catch (error) {
    return notice_(error.status === 400 ? "Code invalide ou expiré. Crée un nouveau code dans Oshka." : "La connexion n’a pas pu être confirmée. Réessaie ; si le code a déjà servi, crée-en un nouveau dans Oshka.");
  }
  return update_(e && e.gmail ? onGmailMessageOpen(e) : onGmailHomepage());
}

function saveMailToOshka(e) {
  if (!token_()) return update_(connectionCard_());
  var expected = e && e.commonEventObject && e.commonEventObject.parameters && e.commonEventObject.parameters.messageId
    || e && e.parameters && e.parameters.messageId;
  if (!expected) return notice_("La carte a expiré. Réouvre le module Oshka sur le mail à enregistrer.");
  var mail;
  try { mail = readMail_(e); }
  catch (_error) { return notice_("Réouvre le mail et le module Oshka, puis réessaie."); }
  // Gmail's event may use msg-f:<decimal>, while GmailApp.getId() returns hex.
  // Compare the canonical IDs read by GmailApp when rendering and saving.
  if (expected !== mail.messageId) return notice_("Le mail sélectionné a changé. Réouvre le module Oshka sur le mail à enregistrer.");
  return update_(captureCard_(mail));
}

function captureCard_(mail) {
  try {
    var result = api_("capture", mail, token_());
    if (!result || typeof result.duplicate !== "boolean") throw new Error("invalid_response");
    return card_("Oshka", result.duplicate ? "Déjà enregistré" : "Ajouté à l’Inbox", CardService.newCardSection()
      .addWidget(paragraph_(result.duplicate ? "Ce mail est déjà dans Oshka. Aucune nouvelle carte n’a été créée." : "Ta carte a été ajoutée à l’Inbox avec le lien vers ce mail."))
      .addWidget(paragraph_(escape_(mail.title)))
      .addWidget(paragraph_(autoCaptureHint_()))
      .addWidget(openOshka_()));
  } catch (error) {
    if (error.status === 401) {
      PropertiesService.getUserProperties().deleteProperty(OSHKA_TOKEN_KEY);
      return connectionCard_("La connexion a expiré ou a été retirée. Crée un nouveau code dans Oshka pour reconnecter Gmail.");
    }
    return card_("Oshka", "Ajout à réessayer", CardService.newCardSection()
      .addWidget(paragraph_(error.status === 409 ? "Ouvre Oshka une première fois pour préparer ton Inbox, puis réessaie." : "L’ajout n’a pas pu être confirmé. Réessaie : le même mail ne sera pas ajouté deux fois."))
      .addWidget(paragraph_(escape_(mail.title)))
      .addWidget(CardService.newTextButton().setText("Réessayer").setTextButtonStyle(CardService.TextButtonStyle.FILLED).setOnClickAction(action_("saveMailToOshka").setParameters({ messageId: mail.messageId })))
      .addWidget(paragraph_(autoCaptureHint_()))
      .addWidget(openOshka_()));
  }
}

function autoCaptureHint_() {
  return "Capture automatique active : chaque mail consulté avec le panneau Oshka ouvert est ajouté à l’Inbox. Ferme le panneau pour arrêter.";
}

function readMail_(e) {
  if (!e || !e.gmail || !e.gmail.accessToken || !e.gmail.messageId) throw new Error("missing_message");
  GmailApp.setCurrentMessageAccessToken(e.gmail.accessToken);
  var message = GmailApp.getMessageById(e.gmail.messageId);
  var thread = message.getThread();
  var mailbox = Session.getActiveUser().getEmail().trim().toLowerCase();
  if (!mailbox) throw new Error("missing_mailbox");
  return {
    mailbox: mailbox,
    messageId: message.getId(),
    threadId: thread.getId(),
    url: thread.getPermalink(),
    title: (message.getSubject().trim() || "Mail sans objet").slice(0, 1000),
    sender: message.getFrom().slice(0, 1000),
    sentAt: message.getDate().toISOString(),
    excerpt: message.getPlainBody().replace(/\r\n?/g, "\n").trim().slice(0, 500)
  };
}

function connectionCard_(message) {
  return card_("Connecter Gmail à Oshka", "Une seule fois, sur Mac ou iPhone", CardService.newCardSection()
    .addWidget(paragraph_(message || "Dans Oshka : Paramètres → Connexions et partage → Gmail → Créer un code de connexion. Copie-le puis colle-le ici."))
    .addWidget(paragraph_("Après connexion, chaque mail consulté avec le panneau Oshka ouvert sera ajouté automatiquement à l’Inbox. Ferme le panneau pour arrêter."))
    .addWidget(openOshka_())
    .addWidget(CardService.newTextInput().setFieldName("code").setTitle("Code de connexion Oshka"))
    .addWidget(CardService.newTextButton().setText("Connecter Oshka").setTextButtonStyle(CardService.TextButtonStyle.FILLED).setOnClickAction(action_("connectOshka"))));
}

function token_() { return PropertiesService.getUserProperties().getProperty(OSHKA_TOKEN_KEY); }
function input_(e, name) {
  var input = e && e.commonEventObject && e.commonEventObject.formInputs && e.commonEventObject.formInputs[name];
  return input && input.stringInputs && input.stringInputs.value ? String(input.stringInputs.value[0] || "") : "";
}
function escape_(value) { return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>"); }
function paragraph_(value) { return CardService.newTextParagraph().setText(value); }
function action_(name) { return CardService.newAction().setFunctionName(name).setLoadIndicator(CardService.LoadIndicator.SPINNER); }
function openOshka_() { return CardService.newTextButton().setText("Ouvrir Oshka").setOpenLink(CardService.newOpenLink().setUrl(OSHKA_ORIGIN + "/")); }
function card_(title, subtitle, section) {
  return CardService.newCardBuilder().setHeader(CardService.newCardHeader().setTitle(title).setSubtitle(subtitle).setImageUrl(OSHKA_ORIGIN + "/icon-192.png")).addSection(section).build();
}
function update_(card) { return CardService.newActionResponseBuilder().setNavigation(CardService.newNavigation().updateCard(card)).build(); }
function notice_(message) { return CardService.newActionResponseBuilder().setNotification(CardService.newNotification().setText(message)).build(); }
function api_(path, data, token) {
  var options = { method: "post", contentType: "application/json", payload: JSON.stringify(data), muteHttpExceptions: true, followRedirects: false };
  if (token) options.headers = { Authorization: "Bearer " + token };
  var response = UrlFetchApp.fetch(OSHKA_ORIGIN + "/integrations/gmail/" + path, options);
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
    var error = new Error("oshka_request_failed");
    error.status = response.getResponseCode();
    throw error;
  }
  return JSON.parse(response.getContentText());
}

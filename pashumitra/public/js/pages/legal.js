import { h } from '../ui.js';

const updated = '22 October 2026';

export async function terms() {
  const sec = (title, ...paras) => [h('h2', null, title), ...paras.map((p) => (Array.isArray(p) ? h('ul', null, p.map((x) => h('li', null, x))) : h('p', null, p)))];
  return h('div', { class: 'narrow legal', 'data-title': 'Terms of Service' },
    h('h1', null, 'Terms of Service'),
    h('p', { class: 'muted' }, 'Last updated ' + updated),
    ...sec('1. What this service is',
      'PashuMitra AI is a screening and awareness tool for people who keep cattle, buffalo, sheep, goats and poultry. It combines the signs you report, movement measured from a short video, the pattern of a sound recording and shed conditions such as temperature, humidity and ammonia, and returns a risk level with reasons and first-aid steps.'),
    ...sec('2. It is not veterinary advice',
      'Results are risk screenings produced by fixed rules. They are not a diagnosis, a prescription or a substitute for examination by a registered veterinarian. Sound labels describe the shape of a recording, such as cough-like or panting-like. They do not translate what an animal means.',
      'The service never gives medicine names with doses. Treatment, dose and milk or meat withdrawal periods must come from a veterinarian.'),
    ...sec('3. Emergencies',
      'If an animal is bloated, struggling to breathe, cannot stand, may have eaten poison, or is bleeding heavily, call a veterinarian immediately. Do not wait for the app. The app may be wrong, may be unavailable, and cannot examine the animal.'),
    ...sec('4. Your account',
      ['You must give accurate information and keep your password private.', 'You are responsible for activity under your account.', 'Veterinarian accounts become active only after an administrator verifies them. Verification is a check made by the operator of this service and is not a guarantee of any licence.', 'You may delete your account at any time from the Account page. This removes your animals, scans and reminders.']),
    ...sec('5. Acceptable use',
      ['Do not try to break, probe or overload the service, or access other people\'s data.', 'Do not upload unlawful material or content about other people.', 'Do not rely on the service to decide whether to report a notifiable disease. Report suspected cases to a veterinarian or the Animal Husbandry office.']),
    ...sec('6. Reporting notifiable diseases',
      'Foot and Mouth Disease, Lumpy Skin Disease, Newcastle disease and some other conditions must be reported under local law. The service shows an alert, but the legal duty to report stays with you and your veterinarian.'),
    ...sec('7. Availability and changes',
      'The service is provided as it is, without a promise of uninterrupted operation. Features and rules may change. If we change these terms in a way that matters to you, we will show a notice in the app.'),
    ...sec('8. Limits of liability',
      'To the extent the law allows, the operator is not liable for loss of animals, income or data that results from relying on the screening, from downtime, or from mistaken input. Nothing here limits liability that cannot be limited by law.'),
    ...sec('9. Contact', 'Questions about these terms go to the administrator of the deployment you are using.'),
    h('p', null, h('a', { href: '#/privacy' }, 'Read the Privacy Policy')));
}

export async function privacy() {
  const sec = (title, ...paras) => [h('h2', null, title), ...paras.map((p) => (Array.isArray(p) ? h('ul', null, p.map((x) => h('li', null, x))) : h('p', null, p)))];
  return h('div', { class: 'narrow legal', 'data-title': 'Privacy Policy' },
    h('h1', null, 'Privacy Policy'),
    h('p', { class: 'muted' }, 'Last updated ' + updated),
    ...sec('1. What we collect',
      ['Account details: name, email, role, district, optional phone number and clinic name, and your chosen language.', 'Farm records you enter: animals (tag, species, breed, age, notes), scan inputs and results, shed readings, vaccination reminders.', 'Sound features: numbers such as loudness and rhythm that are computed on your device from a recording.', 'Movement features: per-second movement numbers computed on your device from a video.', 'Security records: sign-in events with time and network address, kept in an audit log.']),
    ...sec('2. What stays on your device',
      'Raw video and raw audio are processed in your browser and are never uploaded. Only the computed numbers listed above are sent when you run a scan. The small movement picture shown on the result page is drawn on your device and is not stored.'),
    ...sec('3. Why we use it',
      ['To give you the screening result and keep a history for each animal.', 'To let a veterinarian you choose see the report you share with them.', 'To show anonymous district counts of suspected FMD, LSD and Newcastle cases so neighbours can be warned. These counts show a district, a disease name and numbers only. They never show a farm, a person or an animal.', 'To keep the service secure and to investigate misuse.']),
    ...sec('4. Who can see your data',
      ['You can see your own records.', 'A veterinarian can see a scan only after you share that scan with them, together with your name and phone number so they can reach you.', 'Administrators can manage accounts and see security logs. They cannot read your password.', 'Reviewed and feedback-labelled scans may be exported for improving the rules. The export contains the species, the signs reported and the labels. It contains no names, emails, districts or phone numbers.']),
    ...sec('5. Security',
      'Passwords are stored only as salted scrypt hashes. Sessions use secure random tokens in HttpOnly cookies. Requests are checked for cross-site forgery, input is validated and cleaned, and sign-in attempts are rate limited. No system is perfectly secure, so use a strong password that you do not reuse.'),
    ...sec('6. Cookies and local storage',
      'One session cookie keeps you signed in and expires after a few hours. Your language choice is kept in your browser storage. There are no advertising or tracking cookies and no third-party analytics.'),
    ...sec('7. Weather lookups',
      'If you press the live weather button, the server sends the place name you typed to a public weather service to get temperature and humidity. Your name, account and animals are not sent.'),
    ...sec('8. Retention and deletion',
      'Records are kept until you delete them. You can delete an animal, or delete your whole account from the Account page, which removes your animals, scans, reminders and shed readings. Security log entries are kept for audit and do not contain scan content.'),
    ...sec('9. Your choices',
      'You can correct your details on the Account page, change your language at any time, and stop using the service whenever you like.'),
    ...sec('10. Children', 'The service is meant for adults who keep animals and is not directed to children.'),
    ...sec('11. Changes and contact',
      'If this policy changes in a way that matters, a notice will appear in the app. Questions go to the administrator of the deployment you are using.'),
    h('p', null, h('a', { href: '#/terms' }, 'Read the Terms of Service')));
}

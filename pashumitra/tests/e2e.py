import sys, json
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:3111'
SHOT = sys.argv[2] if len(sys.argv) > 2 else '/tmp'
problems = []
def check(cond, msg):
    print(('PASS ' if cond else 'FAIL ') + msg)
    if not cond: problems.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1200, 'height': 900}, permissions=[])
    page = ctx.new_page()
    errors = []
    page.on('console', lambda m: errors.append(m.text) if m.type in ('error',) else None)
    page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))

    # ---- landing + live demo
    page.goto(BASE + '/')
    page.wait_for_selector('h1')
    check('Spot a sick animal' in page.inner_text('h1'), 'landing renders')
    page.click('text=Foot and mouth pattern')
    page.wait_for_selector('.alert', timeout=8000)
    txt = page.inner_text('.alert')
    check('FMD' in txt and 'High risk' in txt, 'demo FMD preset gives high risk FMD')
    check('Uneven movement' in txt, 'demo shows movement reasoning')
    check(page.locator('.alert canvas').count() == 1, 'demo draws movement heat canvas')
    page.click('text=Heat stress pattern'); page.wait_for_selector('.alert.yellow, .alert.red', timeout=8000)
    check('Heat stress' in page.inner_text('.alert'), 'demo heat preset')
    page.click('text=Healthy animal'); page.wait_for_selector('.alert.green', timeout=8000)
    check('Low risk' in page.inner_text('.alert'), 'demo healthy preset low risk')
    page.screenshot(path=SHOT + '/landing.png', full_page=False)

    # legal
    for path, word in (('#/terms', 'Terms of Service'), ('#/privacy', 'Privacy Policy')):
        page.goto(BASE + '/' + path); page.wait_for_selector('h1')
        check(word in page.inner_text('h1'), word + ' page')

    # ---- sign up farmer
    page.goto(BASE + '/#/signup'); page.wait_for_selector('form')
    inputs = page.locator('form input[type=text], form input[type=email], form input[type=password], form input[type=tel]')
    page.fill('input[type=email]', 'ravi@example.com')
    page.locator('input[autocomplete=name]').fill('Ravi Kumar')
    page.fill('input[type=password]', 'Field-gate-2026')
    page.locator('input[autocomplete=address-level2]').fill('Bengaluru Urban')
    page.click('button[type=submit]')
    page.wait_for_selector('.err:not([hidden])', timeout=4000)
    check('Terms' in page.inner_text('.err:not([hidden])'), 'consent required error shown')
    page.check('input[type=checkbox]')
    page.click('button[type=submit]')
    page.wait_for_url('**/#/farm', timeout=8000)
    page.wait_for_selector('h1')
    check('Start by adding an animal' in page.inner_text('main'), 'new farmer lands on dashboard')

    # animals
    page.goto(BASE + '/#/animals'); page.wait_for_selector('form')
    page.locator('form input[type=text]').first.fill('Lakshmi')
    page.click('form button[type=submit]')
    page.wait_for_selector('table', timeout=5000)
    check('Lakshmi' in page.inner_text('table'), 'animal added and listed')
    page.locator('form input[type=text]').first.fill('<b>Bad</b>')
    page.click('form button[type=submit]')
    page.wait_for_timeout(600)
    check('<b>' not in page.inner_text('main'), 'markup in animal tag is not rendered')

    # scan
    page.goto(BASE + '/#/scan'); page.wait_for_selector('.checks input')
    for label in ('Drooling', 'Limping or uneven walking', 'Feels hot, fever'):
        page.locator('label.check', has_text=label).first.click()
    page.fill('input[step="0.1"][min="-10"]', '30')
    page.locator('input[min="0"][max="100"]').first.fill('84')
    page.locator('button.primary').last.click()
    page.wait_for_url('**/#/scans/*', timeout=8000)
    page.wait_for_selector('.alert')
    t = page.inner_text('.alert')
    check('FMD' in t and 'High risk' in t, 'scan result is FMD high risk')
    check('Call a vet within 24 hours' in t, 'scan result tells farmer to call a vet')
    page.screenshot(path=SHOT + '/result.png', full_page=True)

    # video file analysis with a generated clip would need ffmpeg; test camera-less message instead
    page.goto(BASE + '/#/scan'); page.wait_for_selector('.checks input')
    page.click('text=Record with camera'); page.wait_for_timeout(500)
    check('Camera' in page.inner_text('main') or 'camera' in page.inner_text('main'), 'camera denied handled gracefully')

    # dashboard after scan
    page.goto(BASE + '/#/farm'); page.wait_for_selector('.stats')
    check('Lakshmi' in page.inner_text('main'), 'dashboard lists animal needing attention')
    page.screenshot(path=SHOT + '/dashboard.png', full_page=True)

    # ask
    page.goto(BASE + '/#/ask'); page.wait_for_selector('#askq')
    page.fill('#askq', 'how much oxytetracycline should I give'); page.keyboard.press('Enter')
    page.wait_for_selector('.msg.blocked', timeout=5000)
    check('cannot give medicine doses' in page.inner_text('.msg.blocked'), 'ask refuses doses')
    page.fill('#askq', 'my cow is bloated on the left side'); page.keyboard.press('Enter')
    page.wait_for_selector('.msg.emergency', timeout=5000)
    check('Emergency' in page.inner_text('.msg.emergency'), 'ask escalates emergency')

    # language switch
    page.goto(BASE + '/#/farm'); page.wait_for_selector('.langsel')
    page.select_option('.langsel', 'ta'); page.wait_for_timeout(800)
    check('பண்ணை' in page.inner_text('h1'), 'Tamil UI after language switch')
    page.select_option('.langsel', 'en'); page.wait_for_timeout(500)

    # other pages render
    for path in ('#/vaccines', '#/help', '#/library', '#/library/fmd', '#/account'):
        page.goto(BASE + '/' + path); page.wait_for_selector('h1'); page.wait_for_timeout(300)
        check('Something went wrong' not in page.inner_text('main'), 'page ' + path)

    # route guard: farmer cannot open admin
    page.goto(BASE + '/#/admin'); page.wait_for_timeout(600)
    check('/admin' not in page.url, 'farmer redirected away from admin page')

    # sign out
    page.goto(BASE + '/#/account'); page.wait_for_selector('text=Sign out'); page.click('text=Sign out')
    page.wait_for_selector('.hero'); check(True, 'signed out')

    # ---- vet signs up, admin verifies, shares, review
    ctx2 = b.new_context(viewport={'width': 1200, 'height': 900}); vp = ctx2.new_page(); vp.on('pageerror', lambda e: errors.append('vet pageerror: ' + str(e)))
    vp.goto(BASE + '/#/signup'); vp.wait_for_selector('form')
    vp.fill('input[type=email]', 'vet@example.com'); vp.locator('input[autocomplete=name]').fill('Dr Anita Rao')
    vp.fill('input[type=password]', 'Vet-office-2026'); vp.select_option('form select >> nth=0', 'vet')
    vp.locator('input[autocomplete=address-level2]').fill('Bengaluru Urban'); vp.locator('input[type=tel]').fill('+919876543210')
    vp.check('input[type=checkbox]'); vp.click('button[type=submit]')
    vp.wait_for_url('**/#/cases', timeout=8000)
    check('waiting for verification' in vp.inner_text('main'), 'unverified vet sees verification notice')

    ctx3 = b.new_context(viewport={'width': 1200, 'height': 900}); ap = ctx3.new_page(); ap.on('pageerror', lambda e: errors.append('admin pageerror: ' + str(e)))
    ap.goto(BASE + '/#/signin'); ap.wait_for_selector('form')
    ap.fill('input[type=email]', 'boss@example.com'); ap.fill('input[type=password]', 'Admin-pass-2026'); ap.click('button[type=submit]')
    ap.wait_for_url('**/#/admin', timeout=8000); ap.wait_for_selector('.stats')
    ap.locator('tr', has_text='vet@example.com').locator('button', has_text='Verify').click()
    ap.wait_for_selector('tr:has-text("vet@example.com") >> text=Verified', timeout=5000)
    check(True, 'admin verified the vet')
    ap.screenshot(path=SHOT + '/admin.png', full_page=True)

    # farmer shares scan
    page.goto(BASE + '/#/signin'); page.wait_for_selector('form')
    page.fill('input[type=email]', 'ravi@example.com'); page.fill('input[type=password]', 'Field-gate-2026'); page.click('button[type=submit]')
    page.wait_for_url('**/#/farm'); page.goto(BASE + '/#/animals'); page.wait_for_selector('table'); page.click('a:has-text("Lakshmi")')
    page.wait_for_selector('table'); page.click('table a >> nth=0'); page.wait_for_selector('.alert')
    page.click('button:has-text("Share with a vet")'); page.wait_for_timeout(1000)
    check('Shared with a veterinarian' in page.inner_text('main'), 'scan shared with vet')

    vp.reload(); vp.wait_for_selector('table', timeout=6000)
    check('Lakshmi' in vp.inner_text('table'), 'vet sees shared case')
    vp.click('table a >> nth=0'); vp.wait_for_selector('form')
    vp.select_option('form select', 'lsd'); vp.fill('textarea', 'Nodules on examination'); vp.click('text=Save')
    vp.wait_for_selector('text=Corrected', timeout=5000); check(True, 'vet corrected the case')
    page.reload(); page.wait_for_selector('.alert'); page.wait_for_timeout(500)
    check('Corrected to' in page.inner_text('main'), 'farmer sees vet correction')

    # mobile layout and no horizontal overflow
    mctx = b.new_context(viewport={'width': 375, 'height': 800}); mp = mctx.new_page()
    mp.goto(BASE + '/'); mp.wait_for_selector('h1')
    over = mp.evaluate('document.documentElement.scrollWidth - window.innerWidth')
    check(over <= 1, 'no horizontal scroll on 375px landing (overflow %s)' % over)
    mp.screenshot(path=SHOT + '/mobile.png', full_page=False)

    real = [e for e in errors if 'favicon' not in e and 'permission' not in e.lower() and 'Failed to load resource' not in e]
    check(len(real) == 0, 'no console or page errors: ' + json.dumps(real)[:500])
    csp = [e for e in errors if 'Content Security Policy' in e]
    check(len(csp) == 0, 'no CSP violations: ' + json.dumps(csp)[:500])
    b.close()

print('\nFAILURES:', len(problems))
sys.exit(1 if problems else 0)

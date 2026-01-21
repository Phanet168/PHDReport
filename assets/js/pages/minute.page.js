import { isSuper, isAdmin } from '../app.auth.js';

const WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbwN73O8wFOAdYp1OLoLIQaadXdhQ9H59C3TmKfD0Kkp5VXetrg02wzoucPP7XwQNf3C_Q/exec";

function readForm(root) {
  const q = id => root.querySelector(id)?.value || "";
  return {
    date:        q("#minuteDate"),
    topic:       q("#minuteTopic"),
    chair:       q("#minuteChair"),
    endTime:     q("#minuteEndTime"),
    attendees:   q("#minuteParticipants"),
    count:       q("#minuteCount"),
    agenda:      q("#minuteAgenda"),
    opening:     q("#minuteOpening"),
    discussion:  q("#minuteDiscussion"),
    conclusion:  q("#minuteConclusion")
  };
}

function setStatus(root, msg, ok=true){
  const el = root.querySelector("#statusLine");
  el.textContent = msg;
  el.classList.toggle("text-danger", !ok);
}

function exportBrowserPDF(text){
  const win = window.open("", "_blank");
  win.document.write(`
    <html><body>
      <pre>${text}</pre>
      <script>
        window.onload = () => { window.print(); setTimeout(()=>window.close(), 300); };
      </script>
    </body></html>
  `);
  win.document.close();
}

async function generateMinuteAI(root) {
  const data = readForm(root);

  if (!data.date || !data.topic) {
    setStatus(root, "ត្រូវការកាលបរិច្ឆេទ និង ប្រធានបទ", false);
    return;
  }

  setStatus(root, "កំពុងបង្កើត AI + Google Doc ...");

  try {
    const res = await fetch(WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      mode: "cors"
    });

    const json = await res.json();

    if (!json.ok) {
      setStatus(root, "AI/GAS Error: " + json.error, false);
      return;
    }

    root.querySelector("#aiOutput").value = json.aiText;
    setStatus(root, "AI Generate OK!");

    alert("Google Doc:\n" + json.docUrl + "\n\nPDF:\n" + json.pdfUrl);

  } catch (err) {
    console.error(err);
    setStatus(root, "Network Error", false);
  }
}

export default async function hydrate(root) {

  if (!(isSuper() || isAdmin())) {
    root.innerHTML = `<div class="alert alert-warning">Access Denied</div>`;
    return;
  }

  root.innerHTML = `
    <form class="card p-3 shadow-sm">

      <div id="statusLine" class="small text-muted mb-2"></div>

      <div class="row g-3">

        <div class="col-md-4">
          <label class="form-label">កាលបរិច្ឆេទ</label>
          <input type="date" id="minuteDate" class="form-control"/>
        </div>

        <div class="col-md-8">
          <label class="form-label">ប្រធានបទ</label>
          <input type="text" id="minuteTopic" class="form-control"/>
        </div>

        <div class="col-md-6">
          <label class="form-label">ប្រធានអង្គប្រជុំ</label>
          <input type="text" id="minuteChair" class="form-control"/>
        </div>

        <div class="col-md-6">
          <label class="form-label">ពេលបញ្ចប់</label>
          <input type="time" id="minuteEndTime" class="form-control"/>
        </div>

        <div class="col-8">
          <label class="form-label">អ្នកចូលរួម</label>
          <textarea id="minuteParticipants" class="form-control"></textarea>
        </div>

        <div class="col-4">
          <label class="form-label">ចំនួន</label>
          <input type="number" id="minuteCount" class="form-control"/>
        </div>

        <div class="col-12">
          <label class="form-label">របៀបវារៈ</label>
          <textarea id="minuteAgenda" class="form-control"></textarea>
        </div>

        <div class="col-12">
          <label class="form-label">មតិបើក</label>
          <textarea id="minuteOpening" class="form-control"></textarea>
        </div>

        <div class="col-12">
          <label class="form-label">ការពិភាក្សា</label>
          <textarea id="minuteDiscussion" class="form-control"></textarea>
        </div>

        <div class="col-12">
          <label class="form-label">សេចក្តីសន្និដ្ឋាន</label>
          <textarea id="minuteConclusion" class="form-control"></textarea>
        </div>

      </div>

      <hr/>

      <div class="d-flex gap-2">
        <button type="button" id="btnGen" class="btn btn-primary">AI បង្កើតកំណត់ហេតុ</button>
        <button type="button" id="btnPdf" class="btn btn-success">Export PDF</button>
      </div>

      <div class="mt-3">
        <label class="form-label">លទ្ធផល AI</label>
        <textarea id="aiOutput" rows="10" class="form-control"></textarea>
      </div>

    </form>
  `;

  root.querySelector("#btnGen").onclick = () => generateMinuteAI(root);
  root.querySelector("#btnPdf").onclick = () => {
    exportBrowserPDF(root.querySelector("#aiOutput").value);
  };

  setStatus(root, "Ready");
}

export function getTitle(){
  return "កំណត់ហេតុប្រជុំ | Settings";
}

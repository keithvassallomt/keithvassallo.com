function openForm() {
    document.getElementById("contact-form").style.display = "block";
    document.getElementById("btn-send").style.display = "block";
    document.getElementById("contact-result").style.display = "none";
}
  
function closeForm() {
    document.getElementById("contact-form").style.display = "none";
}

document.addEventListener('mouseup', function(e) {
    var container = document.getElementById('contact-form');
    if (!container.contains(e.target)) {
        closeForm();
    }
});

function showContactStatus() {
    document.getElementById("btn-send").style.display = "none";
    document.getElementById("contact-result").style.display = "block";
}

const form = document.getElementById('contactForm')
const url = 'https://kgw4ur1d08.execute-api.us-east-1.amazonaws.com/dev/email/send'
const toast = document.getElementById('contact-result')
const submit = document.getElementById('btn-send')

function post(url, body, callback) {
  var req = new XMLHttpRequest();
  req.open("POST", url, true);
  req.setRequestHeader("Content-Type", "application/json");
  req.addEventListener("load", function () {
    if (req.status < 400) {
      callback(null, JSON.parse(req.responseText));
    } else {
      callback(new Error("Request failed: " + req.statusText));
    }
  });
  req.send(JSON.stringify(body));
}
function success () {
  toast.innerHTML = '✅ Your message has been sent.'
  toast.style.backgroundColor = '#1B3330'
  toast.style.color = 'white'
  submit.disabled = false
  submit.blur()
  form.name.focus()
  form.name.value = ''
  form.email.value = ''
  form.message.value = ''
}
function error (err) {
  toast.innerHTML = '😭 Welp! That didn\'t work.'
  toast.style.color = 'white'
  toast.style.backgroundColor = 'red'
  submit.disabled = false
  console.log(err)
}
form.addEventListener('submit', function (e) {
  e.preventDefault()
  showContactStatus()
  toast.innerHTML = '⏲️ Sending...'
  toast.style.color = 'black'
  toast.style.backgroundColor = '#feef88'
  const payload = {
    name: form.name.value,
    email: form.email.value,
    content: form.message.value
  }
  post(url, payload, function (err, res) {
    if (err) { return error(err) }
    success()
  })
})
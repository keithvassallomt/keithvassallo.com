const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses')
const https = require('https')

const sesClient = new SESClient()
const myEmail = process.env.EMAIL
const myDomain = process.env.DOMAIN
const turnstileSecretKey = process.env.TURNSTILE_SECRET_KEY

function generateResponse (code, payload) {
  return {
    statusCode: code,
    headers: {
      'Access-Control-Allow-Origin': myDomain,
      'Access-Control-Allow-Headers': 'x-requested-with',
      'Access-Control-Allow-Credentials': true
    },
    body: JSON.stringify(payload)
  }
}

function generateError (code, err) {
  console.log(err)
  return {
    statusCode: code,
    headers: {
      'Access-Control-Allow-Origin': myDomain,
      'Access-Control-Allow-Headers': 'x-requested-with',
      'Access-Control-Allow-Credentials': true
    },
    body: JSON.stringify(err.message)
  }
}

function verifyTurnstileToken(token) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      secret: turnstileSecretKey,
      response: token
    })

    const options = {
      hostname: 'challenges.cloudflare.com',
      port: 443,
      path: '/turnstile/v0/siteverify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length
      }
    }

    const req = https.request(options, (res) => {
      let data = ''

      res.on('data', (chunk) => {
        data += chunk
      })

      res.on('end', () => {
        try {
          const result = JSON.parse(data)
          resolve(result)
        } catch (err) {
          reject(err)
        }
      })
    })

    req.on('error', (err) => {
      reject(err)
    })

    req.write(postData)
    req.end()
  })
}

function generateEmailParams (body) {
  const { email, name, content } = JSON.parse(body)
  console.log(email, name, content)
  if (!(email && name && content)) {
    throw new Error('Missing parameters! Make sure to add parameters \'email\', \'name\', \'content\'.')
  }

  return {
    Source: myEmail,
    Destination: { ToAddresses: [myEmail] },
    ReplyToAddresses: [email],
    Message: {
      Body: {
        Text: {
          Charset: 'UTF-8',
          Data: `Message sent from email ${email} by ${name} \nContent: ${content}`
        }
      },
      Subject: {
        Charset: 'UTF-8',
        Data: `You received a message from ${myDomain}!`
      }
    }
  }
}

module.exports.send = async (event) => {
  try {
    const { turnstileToken } = JSON.parse(event.body)

    if (!turnstileToken) {
      return generateError(400, new Error('Missing Turnstile token'))
    }

    const turnstileResult = await verifyTurnstileToken(turnstileToken)

    if (!turnstileResult.success) {
      console.log('Turnstile verification failed:', turnstileResult)
      return generateError(403, new Error('Failed security verification. Please try again.'))
    }

    const emailParams = generateEmailParams(event.body)
    const command = new SendEmailCommand(emailParams)
    const data = await sesClient.send(command)
    return generateResponse(200, data)
  } catch (err) {
    return generateError(500, err)
  }
}

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OTP Code - Classroom Akaun Simple</title>
    <style>
        body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
        .container { max-width: 600px; margin: 40px auto; background: #fff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { background-color: #696cff; padding: 30px; text-align: center; }
        .header h1 { color: #fff; margin: 0; font-size: 24px; }
        .body { padding: 40px 30px; }
        .otp-box { background: #f0f0ff; border: 2px dashed #696cff; border-radius: 8px; text-align: center; padding: 20px; margin: 30px 0; }
        .otp-code { font-size: 42px; font-weight: bold; color: #696cff; letter-spacing: 10px; }
        .footer { background: #f8f8f8; padding: 20px 30px; text-align: center; font-size: 12px; color: #888; }
        p { color: #555; line-height: 1.6; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Classroom - Akaun Simple</h1>
        </div>
        <div class="body">
            <p>Hello,</p>
            @if($type === 'register')
            <p>Thank you for registering with <strong>Classroom - Akaun Simple</strong>. Please use the OTP code below to verify your email address:</p>
            @else
            <p>You requested a login OTP for <strong>Classroom - Akaun Simple</strong>. Use the code below to sign in:</p>
            @endif

            <div class="otp-box">
                <div class="otp-code">{{ $otpCode }}</div>
            </div>

            <p>This code is valid for <strong>10 minutes</strong>. Do not share this code with anyone.</p>
            <p>If you did not request this code, please ignore this email.</p>

            <p>Regards,<br><strong>Classroom - Akaun Simple Team</strong></p>
        </div>
        <div class="footer">
            <p>Need help? Contact us at <a href="mailto:akaunsimple.my@gmail.com">akaunsimple.my@gmail.com</a> or WhatsApp <a href="https://wa.me/601153503022">+601153503022</a></p>
        </div>
    </div>
</body>
</html>

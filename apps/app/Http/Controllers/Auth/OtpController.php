<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Mail\OtpMail;
use App\Models\OtpCode;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Mail;

class OtpController extends Controller
{
    public function showVerifyForm(Request $request)
    {
        $type = $request->query('type', 'login');
        $email = session('login_email') ?? session('pending_register.email') ?? '';

        if (empty($email)) {
            return redirect()->route($type === 'register' ? 'register' : 'login');
        }

        return view('auth.otp-verify', compact('type', 'email'));
    }

    public function verify(Request $request)
    {
        $request->validate([
            'otp'  => 'required|string|size:6',
            'type' => 'required|in:login,register',
        ]);

        $type = $request->type;
        $email = $type === 'register'
            ? session('pending_register.email')
            : session('login_email');

        if (!$email) {
            return redirect()->route($type === 'register' ? 'register' : 'login')
                ->withErrors(['otp' => 'Session expired. Please try again.']);
        }

        $otp = OtpCode::where('email', $email)
            ->where('code', $request->otp)
            ->where('type', $type)
            ->where('is_used', false)
            ->first();

        if (!$otp || $otp->isExpired()) {
            return back()->withErrors(['otp' => 'Invalid or expired OTP code. Please try again.']);
        }

        $otp->update(['is_used' => true]);

        if ($type === 'register') {
            return $this->completeRegistration($request);
        }

        return $this->completeLogin($request, $email);
    }

    private function completeRegistration(Request $request)
    {
        $data = session('pending_register');

        if (!$data) {
            return redirect()->route('register')
                ->withErrors(['otp' => 'Registration session expired.']);
        }

        $user = User::create([
            'name'             => $data['name'],
            'email'            => $data['email'],
            'whatsapp_number'  => $data['whatsapp_number'],
            'password'         => $data['password'],
            'email_verified_at' => now(),
        ]);

        $user->assignRole('student');

        $request->session()->forget('pending_register');

        Auth::login($user);

        return redirect()->route('dashboard')->with('success', 'Welcome! Your account has been created.');
    }

    private function completeLogin(Request $request, string $email)
    {
        $user = User::where('email', $email)->first();

        if (!$user) {
            return redirect()->route('login')->withErrors(['email' => 'User not found.']);
        }

        $request->session()->forget('login_email');

        Auth::login($user, true);

        return redirect()->intended(route('dashboard'));
    }

    public function resend(Request $request)
    {
        $request->validate([
            'type' => 'required|in:login,register',
        ]);

        $type = $request->type;
        $email = $type === 'register'
            ? session('pending_register.email')
            : session('login_email');

        if (!$email) {
            return response()->json(['success' => false, 'message' => 'Session expired.'], 400);
        }

        OtpCode::where('email', $email)->where('type', $type)->delete();

        $code = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        OtpCode::create([
            'email'      => $email,
            'code'       => $code,
            'type'       => $type,
            'expires_at' => Carbon::now()->addMinutes(10),
        ]);

        Mail::to($email)->send(new OtpMail($code, $type));

        return response()->json(['success' => true, 'message' => 'OTP resent to your email.']);
    }
}

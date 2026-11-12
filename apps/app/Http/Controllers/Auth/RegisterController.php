<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Mail\OtpMail;
use App\Models\OtpCode;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Validator;

class RegisterController extends Controller
{
    public function showRegisterForm()
    {
        return view('auth.register');
    }

    public function register(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name'             => 'required|string|max:255',
            'email'            => 'required|email|unique:users,email',
            'whatsapp_number'  => 'required|string|max:20',
            'password'         => 'required|string|min:8|confirmed',
        ]);

        if ($validator->fails()) {
            return back()->withErrors($validator)->withInput();
        }

        // Store pending registration in session
        $request->session()->put('pending_register', [
            'name'            => $request->name,
            'email'           => $request->email,
            'whatsapp_number' => $request->whatsapp_number,
            'password'        => Hash::make($request->password),
        ]);

        $this->sendOtp($request->email, 'register');

        return redirect()->route('otp.verify.form', ['type' => 'register'])
            ->with('email', $request->email);
    }

    private function sendOtp(string $email, string $type): void
    {
        OtpCode::where('email', $email)->where('type', $type)->delete();

        $code = str_pad(random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        OtpCode::create([
            'email'      => $email,
            'code'       => $code,
            'type'       => $type,
            'expires_at' => Carbon::now()->addMinutes(10),
        ]);

        Mail::to($email)->send(new OtpMail($code, $type));
    }
}

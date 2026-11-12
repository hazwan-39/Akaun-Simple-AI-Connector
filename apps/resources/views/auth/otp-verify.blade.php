@php
$configData = Helper::appClasses();
$customizerHidden = 'customizer-hide';
@endphp

@extends('layouts/blankLayout')

@section('title', 'OTP Verification')

@section('vendor-style')
@vite(['resources/assets/vendor/libs/cleave-zen/cleave-zen.js'])
@endsection

@section('page-style')
@vite(['resources/assets/vendor/scss/pages/page-auth.scss'])
@endsection

@section('content')
<div class="position-relative">
  <div class="authentication-wrapper authentication-basic container-p-y p-4 p-sm-0">
    <div class="authentication-inner py-6">

      <div class="card p-md-7 p-1">
        <!-- Logo -->
        <div class="app-brand justify-content-center mt-5">
          <a href="{{ url('/') }}" class="app-brand-link gap-2">
            <span class="app-brand-logo demo">@include('_partials.macros')</span>
            <span class="app-brand-text demo text-heading fw-semibold">{{ config('variables.templateName') }}</span>
          </a>
        </div>
        <!-- /Logo -->

        <div class="card-body mt-1">
          <h4 class="mb-1">Two-Step Verification 💬</h4>
          <p class="text-start mb-5">
            We sent a 6-digit OTP code to your email.<br>
            <strong>{{ $email }}</strong>
          </p>
          <p class="mb-0">Enter your 6-digit OTP code</p>

          @if ($errors->any())
          <div class="alert alert-danger alert-dismissible mt-3 mb-0" role="alert">
            @foreach ($errors->all() as $error)
            {{ $error }}<br>
            @endforeach
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
          </div>
          @endif

          <form id="otpForm" action="{{ route('otp.verify') }}" method="POST" class="mt-4">
            @csrf
            <input type="hidden" name="type" value="{{ $type }}">

            <div class="mb-5">
              <div class="auth-input-wrapper d-flex align-items-center justify-content-between numeral-mask-wrapper">
                <input type="tel" class="form-control auth-input text-center h-px-50 mx-sm-1 my-2 otp-digit"
                  maxlength="1" inputmode="numeric" pattern="[0-9]*" autofocus />
                <input type="tel" class="form-control auth-input text-center h-px-50 mx-sm-1 my-2 otp-digit"
                  maxlength="1" inputmode="numeric" pattern="[0-9]*" />
                <input type="tel" class="form-control auth-input text-center h-px-50 mx-sm-1 my-2 otp-digit"
                  maxlength="1" inputmode="numeric" pattern="[0-9]*" />
                <input type="tel" class="form-control auth-input text-center h-px-50 mx-sm-1 my-2 otp-digit"
                  maxlength="1" inputmode="numeric" pattern="[0-9]*" />
                <input type="tel" class="form-control auth-input text-center h-px-50 mx-sm-1 my-2 otp-digit"
                  maxlength="1" inputmode="numeric" pattern="[0-9]*" />
                <input type="tel" class="form-control auth-input text-center h-px-50 mx-sm-1 my-2 otp-digit"
                  maxlength="1" inputmode="numeric" pattern="[0-9]*" />
              </div>
              <input type="hidden" name="otp" id="otpHidden" />
            </div>

            <button type="submit" class="btn btn-primary d-grid w-100 mb-5" id="verifyBtn" disabled>
              Verify &amp; Continue
            </button>

            <div class="text-center">
              Didn't receive the code?
              <a href="javascript:void(0);" id="resendBtn" class="resend-otp">Resend OTP</a>
            </div>
            <div id="resendMessage" class="text-center mt-2 text-success d-none"></div>
          </form>
        </div>
      </div>

      <img alt="mask"
        src="{{ asset('assets/img/illustrations/auth-basic-register-mask-' . $configData['theme'] . '.png') }}"
        class="authentication-image d-none d-lg-block"
        data-app-light-img="illustrations/auth-basic-register-mask-light.png"
        data-app-dark-img="illustrations/auth-basic-register-mask-dark.png" />
    </div>
  </div>
</div>

@push('page-scripts')
<script>
document.addEventListener('DOMContentLoaded', function () {
  const digits = document.querySelectorAll('.otp-digit');
  const hiddenInput = document.getElementById('otpHidden');
  const verifyBtn = document.getElementById('verifyBtn');
  const resendBtn = document.getElementById('resendBtn');
  const resendMsg = document.getElementById('resendMessage');
  const otpType = document.querySelector('input[name="type"]').value;

  function updateHidden() {
    let val = '';
    digits.forEach(d => val += d.value);
    hiddenInput.value = val;
    verifyBtn.disabled = val.length < 6;
  }

  digits.forEach((digit, idx) => {
    digit.addEventListener('input', function () {
      this.value = this.value.replace(/[^0-9]/g, '').slice(0, 1);
      updateHidden();
      if (this.value && idx < digits.length - 1) {
        digits[idx + 1].focus();
      }
    });

    digit.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !this.value && idx > 0) {
        digits[idx - 1].focus();
      }
    });

    digit.addEventListener('paste', function (e) {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      pasted.split('').slice(0, 6).forEach((char, i) => {
        if (digits[i]) digits[i].value = char;
      });
      updateHidden();
      const last = Math.min(pasted.length, digits.length) - 1;
      digits[last].focus();
    });
  });

  resendBtn.addEventListener('click', function () {
    resendBtn.classList.add('disabled');
    resendBtn.textContent = 'Sending...';

    fetch('{{ route("otp.resend") }}', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content
      },
      body: JSON.stringify({ type: otpType })
    })
    .then(r => r.json())
    .then(data => {
      resendMsg.textContent = data.message;
      resendMsg.classList.remove('d-none');
      setTimeout(() => {
        resendBtn.classList.remove('disabled');
        resendBtn.textContent = 'Resend OTP';
        resendMsg.classList.add('d-none');
      }, 30000);
    })
    .catch(() => {
      resendBtn.classList.remove('disabled');
      resendBtn.textContent = 'Resend OTP';
    });
  });
});
</script>
@endpush
@endsection

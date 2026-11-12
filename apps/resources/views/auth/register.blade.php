@php
$configData = Helper::appClasses();
$customizerHidden = 'customizer-hide';
@endphp

@extends('layouts/blankLayout')

@section('title', 'Register')

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
          <h4 class="mb-1">Create Your Account</h4>
          <p class="mb-5 text-body-secondary">Join Classroom - Akaun Simple today</p>

          @if ($errors->any())
          <div class="alert alert-danger alert-dismissible mb-4" role="alert">
            <ul class="mb-0 ps-3">
              @foreach ($errors->all() as $error)
              <li>{{ $error }}</li>
              @endforeach
            </ul>
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
          </div>
          @endif

          <form id="formRegister" class="mb-5" action="{{ route('register') }}" method="POST">
            @csrf

            <!-- Name -->
            <div class="form-floating form-floating-outline mb-5">
              <input type="text" class="form-control @error('name') is-invalid @enderror"
                id="name" name="name" placeholder="Enter your full name"
                value="{{ old('name') }}" autofocus required />
              <label for="name">Full Name</label>
            </div>

            <!-- Email -->
            <div class="form-floating form-floating-outline mb-5">
              <input type="email" class="form-control @error('email') is-invalid @enderror"
                id="email" name="email" placeholder="Enter your email"
                value="{{ old('email') }}" required />
              <label for="email">Email Address</label>
            </div>

            <!-- WhatsApp Number -->
            <div class="mb-5">
              <label class="form-label" for="whatsapp_number">WhatsApp Number</label>
              <div class="input-group">
                <span class="input-group-text">+60</span>
                <input type="tel" class="form-control @error('whatsapp_number') is-invalid @enderror"
                  id="whatsapp_number" name="whatsapp_number"
                  placeholder="e.g. 123456789"
                  value="{{ old('whatsapp_number', '') }}" required />
              </div>
              <small class="text-muted">Malaysia number with country code +60 prefix</small>
            </div>

            <!-- Password -->
            <div class="mb-5 form-password-toggle">
              <div class="input-group input-group-merge">
                <div class="form-floating form-floating-outline">
                  <input type="password" id="password" class="form-control @error('password') is-invalid @enderror"
                    name="password" placeholder="Min. 8 characters" required />
                  <label for="password">Password</label>
                </div>
                <span class="input-group-text cursor-pointer"><i class="icon-base ri ri-eye-off-line icon-20px"></i></span>
              </div>
            </div>

            <!-- Confirm Password -->
            <div class="mb-5 form-password-toggle">
              <div class="input-group input-group-merge">
                <div class="form-floating form-floating-outline">
                  <input type="password" id="password_confirmation" class="form-control"
                    name="password_confirmation" placeholder="Confirm password" required />
                  <label for="password_confirmation">Confirm Password</label>
                </div>
                <span class="input-group-text cursor-pointer"><i class="icon-base ri ri-eye-off-line icon-20px"></i></span>
              </div>
            </div>

            <button type="submit" class="btn btn-primary d-grid w-100 mb-5">
              <span>Create Account &amp; Send OTP</span>
            </button>
          </form>

          <p class="text-center mb-0">
            <span>Already have an account?</span>
            <a href="{{ route('login') }}"><span> Sign in instead</span></a>
          </p>
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
@endsection

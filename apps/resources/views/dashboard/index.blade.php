@php
$configData = Helper::appClasses();
@endphp

@extends('layouts/horizontalLayout')

@section('title', 'Dashboard')

@section('content')
<div class="row g-6">

  <!-- Welcome Card -->
  <div class="col-12">
    <div class="card">
      <div class="d-flex align-items-end row">
        <div class="col-md-8 order-2 order-md-1">
          <div class="card-body">
            <h4 class="card-title mb-4">
              Welcome back, <span class="fw-bold">{{ $user->name }}</span>! 👋
            </h4>
            <p class="mb-1 text-body-secondary">
              Role: <span class="badge bg-label-primary">{{ ucfirst($user->getRoleNames()->first() ?? 'Student') }}</span>
            </p>
            <p class="mb-4 text-body-secondary">
              You are logged in to <strong>Classroom - Akaun Simple</strong>.
            </p>
            <a href="{{ route('profile') }}" class="btn btn-primary">View My Profile</a>
          </div>
        </div>
        <div class="col-md-4 text-center text-md-end order-1 order-md-2">
          <div class="card-body pb-0 px-4 pt-4">
            <img src="{{ asset('assets/img/illustrations/illustration-john-' . $configData['theme'] . '.png') }}"
              height="160" class="scaleX-n1-rtl" alt="Welcome"
              data-app-light-img="illustrations/illustration-john-light.png"
              data-app-dark-img="illustrations/illustration-john-dark.png" />
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Stats Row -->
  <div class="col-sm-6 col-xl-3">
    <div class="card h-100">
      <div class="card-body d-flex align-items-center gap-4">
        <div class="avatar avatar-xl">
          <span class="avatar-initial rounded bg-label-primary">
            <i class="icon-base ri ri-user-line icon-26px"></i>
          </span>
        </div>
        <div>
          <h5 class="mb-0">My Profile</h5>
          <small class="text-body-secondary">Account information</small>
        </div>
      </div>
      <div class="card-footer pt-0">
        <a href="{{ route('profile') }}" class="btn btn-sm btn-outline-primary w-100">View Profile</a>
      </div>
    </div>
  </div>

  <div class="col-sm-6 col-xl-3">
    <div class="card h-100">
      <div class="card-body d-flex align-items-center gap-4">
        <div class="avatar avatar-xl">
          <span class="avatar-initial rounded bg-label-success">
            <i class="icon-base ri ri-mail-check-line icon-26px"></i>
          </span>
        </div>
        <div>
          <h5 class="mb-0">Email Verified</h5>
          <small class="text-body-secondary">
            {{ $user->email_verified_at ? $user->email_verified_at->format('d M Y') : 'Not verified' }}
          </small>
        </div>
      </div>
    </div>
  </div>

  <div class="col-sm-6 col-xl-3">
    <div class="card h-100">
      <div class="card-body d-flex align-items-center gap-4">
        <div class="avatar avatar-xl">
          <span class="avatar-initial rounded bg-label-info">
            <i class="icon-base ri ri-whatsapp-line icon-26px"></i>
          </span>
        </div>
        <div>
          <h5 class="mb-0">WhatsApp</h5>
          <small class="text-body-secondary">
            {{ $user->whatsapp_number ? '+60' . $user->whatsapp_number : 'Not set' }}
          </small>
        </div>
      </div>
    </div>
  </div>

  <div class="col-sm-6 col-xl-3">
    <div class="card h-100">
      <div class="card-body d-flex align-items-center gap-4">
        <div class="avatar avatar-xl">
          <span class="avatar-initial rounded bg-label-warning">
            <i class="icon-base ri ri-shield-check-line icon-26px"></i>
          </span>
        </div>
        <div>
          <h5 class="mb-0">Account Status</h5>
          <small>
            @if($user->is_active)
            <span class="badge bg-label-success">Active</span>
            @else
            <span class="badge bg-label-danger">Inactive</span>
            @endif
          </small>
        </div>
      </div>
    </div>
  </div>

</div>
@endsection

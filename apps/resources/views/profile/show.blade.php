@php
$configData = Helper::appClasses();
@endphp

@extends('layouts/horizontalLayout')

@section('title', 'My Profile')

@section('content')

@if (session('success'))
<div class="alert alert-success alert-dismissible mb-4" role="alert">
  {{ session('success') }}
  <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
</div>
@endif

<div class="row g-6">

  <!-- Profile Info Card -->
  <div class="col-xl-4 col-lg-5">
    <div class="card">
      <div class="card-body pt-12 pb-6 text-center">
        <div class="avatar avatar-xxl mb-4 mx-auto">
          <img src="{{ $user->profile_photo_url }}" alt="Avatar" class="rounded-circle"
            id="profilePhotoPreview" style="width:100%; height:100%; object-fit:cover;" />
        </div>
        <h5 class="mb-0">{{ $user->name }}</h5>
        <small class="text-body-secondary">{{ $user->email }}</small>
        <div class="mt-2">
          <span class="badge bg-label-primary">{{ ucfirst($user->getRoleNames()->first() ?? 'Student') }}</span>
        </div>
      </div>
      <div class="card-body border-top px-4 py-4">
        <ul class="list-unstyled mb-0">
          <li class="d-flex align-items-center gap-3 mb-3">
            <i class="icon-base ri ri-whatsapp-line icon-22px text-success"></i>
            <span>{{ $user->whatsapp_number ? '+60' . $user->whatsapp_number : 'Not set' }}</span>
          </li>
          <li class="d-flex align-items-center gap-3 mb-3">
            <i class="icon-base ri ri-mail-line icon-22px text-primary"></i>
            <span>{{ $user->email }}</span>
          </li>
          <li class="d-flex align-items-center gap-3">
            <i class="icon-base ri ri-calendar-line icon-22px text-info"></i>
            <span>Joined {{ $user->created_at->format('d M Y') }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>

  <!-- Edit Profile Form -->
  <div class="col-xl-8 col-lg-7">

    <!-- Personal Info -->
    <div class="card mb-6">
      <div class="card-header">
        <h5 class="mb-0">Edit Profile</h5>
      </div>
      <div class="card-body">

        @if ($errors->has('name') || $errors->has('whatsapp_number') || $errors->has('profile_photo'))
        <div class="alert alert-danger alert-dismissible mb-4">
          <ul class="mb-0 ps-3">
            @foreach (['name', 'whatsapp_number', 'profile_photo'] as $field)
              @error($field)<li>{{ $message }}</li>@enderror
            @endforeach
          </ul>
          <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
        @endif

        <form action="{{ route('profile.update') }}" method="POST" enctype="multipart/form-data">
          @csrf
          @method('PUT')

          <div class="row g-4">

            <!-- Profile Photo -->
            <div class="col-12">
              <label class="form-label">Profile Photo</label>
              <div class="d-flex align-items-center gap-4">
                <div class="avatar avatar-xl">
                  <img src="{{ $user->profile_photo_url }}" id="photoThumb"
                    class="rounded-circle" style="width:100%; height:100%; object-fit:cover;" />
                </div>
                <div>
                  <label for="profile_photo" class="btn btn-outline-primary mb-2">
                    <i class="icon-base ri ri-upload-2-line me-2"></i>Upload Photo
                  </label>
                  <input type="file" id="profile_photo" name="profile_photo"
                    class="d-none" accept="image/jpeg,image/png,image/jpg"
                    onchange="previewPhoto(this)" />
                  <p class="text-muted small mb-0">JPG, JPEG or PNG. Max 2MB.</p>
                </div>
              </div>
            </div>

            <!-- Name -->
            <div class="col-md-6">
              <div class="form-floating form-floating-outline">
                <input type="text" class="form-control @error('name') is-invalid @enderror"
                  id="name" name="name" placeholder="Full Name"
                  value="{{ old('name', $user->name) }}" required />
                <label for="name">Full Name</label>
              </div>
            </div>

            <!-- Email (readonly) -->
            <div class="col-md-6">
              <div class="form-floating form-floating-outline">
                <input type="email" class="form-control"
                  id="email_display" value="{{ $user->email }}" readonly />
                <label for="email_display">Email Address</label>
              </div>
              <small class="text-muted">Email cannot be changed.</small>
            </div>

            <!-- WhatsApp -->
            <div class="col-md-6">
              <label class="form-label">WhatsApp Number</label>
              <div class="input-group">
                <span class="input-group-text">+60</span>
                <input type="tel" class="form-control @error('whatsapp_number') is-invalid @enderror"
                  name="whatsapp_number" placeholder="123456789"
                  value="{{ old('whatsapp_number', $user->whatsapp_number) }}" />
              </div>
            </div>

            <div class="col-12 pt-2">
              <button type="submit" class="btn btn-primary me-3">Save Changes</button>
              <a href="{{ route('dashboard') }}" class="btn btn-outline-secondary">Cancel</a>
            </div>

          </div>
        </form>
      </div>
    </div>

    <!-- Change Password -->
    <div class="card">
      <div class="card-header">
        <h5 class="mb-0">Change Password</h5>
      </div>
      <div class="card-body">

        @if ($errors->has('current_password') || $errors->has('password'))
        <div class="alert alert-danger alert-dismissible mb-4">
          <ul class="mb-0 ps-3">
            @error('current_password')<li>{{ $message }}</li>@enderror
            @error('password')<li>{{ $message }}</li>@enderror
          </ul>
          <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
        @endif

        <form action="{{ route('profile.password') }}" method="POST">
          @csrf
          @method('PUT')

          <div class="row g-4">

            <div class="col-md-6">
              <div class="form-floating form-floating-outline form-password-toggle">
                <div class="input-group input-group-merge">
                  <div class="form-floating form-floating-outline w-100">
                    <input type="password" class="form-control"
                      name="current_password" placeholder="Current password" required />
                    <label>Current Password</label>
                  </div>
                  <span class="input-group-text cursor-pointer"><i class="icon-base ri ri-eye-off-line"></i></span>
                </div>
              </div>
            </div>

            <div class="col-md-6">
              <div class="input-group input-group-merge form-password-toggle">
                <div class="form-floating form-floating-outline w-100">
                  <input type="password" class="form-control"
                    name="password" placeholder="New password" required />
                  <label>New Password</label>
                </div>
                <span class="input-group-text cursor-pointer"><i class="icon-base ri ri-eye-off-line"></i></span>
              </div>
            </div>

            <div class="col-md-6">
              <div class="input-group input-group-merge form-password-toggle">
                <div class="form-floating form-floating-outline w-100">
                  <input type="password" class="form-control"
                    name="password_confirmation" placeholder="Confirm new password" required />
                  <label>Confirm New Password</label>
                </div>
                <span class="input-group-text cursor-pointer"><i class="icon-base ri ri-eye-off-line"></i></span>
              </div>
            </div>

            <div class="col-12 pt-2">
              <button type="submit" class="btn btn-primary">Update Password</button>
            </div>

          </div>
        </form>
      </div>
    </div>

  </div>
</div>

@push('page-scripts')
<script>
function previewPhoto(input) {
  if (input.files && input.files[0]) {
    const reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById('photoThumb').src = e.target.result;
      document.getElementById('profilePhotoPreview').src = e.target.result;
    };
    reader.readAsDataURL(input.files[0]);
  }
}
</script>
@endpush
@endsection

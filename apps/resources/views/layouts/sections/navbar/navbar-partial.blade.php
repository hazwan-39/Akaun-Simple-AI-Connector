@php
  use Illuminate\Support\Facades\Auth;
  use Illuminate\Support\Facades\Route;
@endphp

<!--  Brand demo (display only for navbar-full and hide on below xl) -->
@if (isset($navbarFull))
  <div class="navbar-brand app-brand demo d-none d-xl-flex py-0 me-6">
    <a href="{{ url('/') }}" class="app-brand-link gap-2">
      <span class="app-brand-logo demo">@include('_partials.macros')</span>
      <span class="app-brand-text demo menu-text fw-semibold ms-1">{{ config('variables.templateName') }}</span>
    </a>

    @if (isset($menuHorizontal))
      <a href="javascript:void(0);" class="layout-menu-toggle menu-link text-large ms-auto d-xl-none">
        <i class="icon-base ri ri-close-line icon-sm"></i>
      </a>
    @endif
  </div>
@endif

@if (!isset($navbarHideToggle))
  <div class="layout-menu-toggle navbar-nav align-items-xl-center me-4 me-xl-0
    {{ isset($menuHorizontal) ? ' d-xl-none ' : '' }}
    {{ isset($contentNavbar) ? ' d-xl-none ' : '' }}">
    <a class="nav-item nav-link px-0 me-xl-6" href="javascript:void(0)">
      <i class="icon-base ri ri-menu-line icon-md"></i>
    </a>
  </div>
@endif

<div class="navbar-nav-right d-flex align-items-center justify-content-end" id="navbar-collapse">

  <ul class="navbar-nav flex-row align-items-center ms-md-auto">

    <!-- Theme Switcher -->
    <li class="nav-item dropdown me-sm-2 me-xl-0">
      <a class="nav-link dropdown-toggle hide-arrow btn btn-icon btn-text-secondary rounded-pill"
        id="nav-theme" href="javascript:void(0);" data-bs-toggle="dropdown">
        <i class="icon-base ri ri-sun-line icon-22px theme-icon-active"></i>
      </a>
      <ul class="dropdown-menu dropdown-menu-end">
        <li>
          <button type="button" class="dropdown-item align-items-center active" data-bs-theme-value="light">
            <i class="icon-base ri ri-sun-line icon-22px me-3" data-icon="sun-line"></i>Light
          </button>
        </li>
        <li>
          <button type="button" class="dropdown-item align-items-center" data-bs-theme-value="dark">
            <i class="icon-base ri ri-moon-clear-line icon-22px me-3" data-icon="moon-clear-line"></i>Dark
          </button>
        </li>
        <li>
          <button type="button" class="dropdown-item align-items-center" data-bs-theme-value="system">
            <i class="icon-base ri ri-computer-line icon-22px me-3" data-icon="computer-line"></i>System
          </button>
        </li>
      </ul>
    </li>
    <!-- / Theme Switcher -->

    <!-- User Dropdown -->
    <li class="nav-item navbar-dropdown dropdown-user dropdown">
      <a class="nav-link dropdown-toggle hide-arrow" href="javascript:void(0);" data-bs-toggle="dropdown">
        <div class="avatar avatar-online">
          <img src="{{ Auth::check() ? Auth::user()->profile_photo_url : asset('assets/img/avatars/1.png') }}"
            alt="avatar" class="rounded-circle" />
        </div>
      </a>
      <ul class="dropdown-menu dropdown-menu-end mt-3 py-2">
        @auth
        <li>
          <a class="dropdown-item" href="{{ route('profile') }}">
            <div class="d-flex align-items-center">
              <div class="flex-shrink-0 me-2">
                <div class="avatar avatar-online">
                  <img src="{{ Auth::user()->profile_photo_url }}"
                    alt="avatar" class="w-px-40 h-auto rounded-circle" />
                </div>
              </div>
              <div class="flex-grow-1">
                <h6 class="mb-0 small">{{ Auth::user()->name }}</h6>
                <small class="text-body-secondary">
                  {{ ucfirst(Auth::user()->getRoleNames()->first() ?? 'Student') }}
                </small>
              </div>
            </div>
          </a>
        </li>
        <li><div class="dropdown-divider"></div></li>
        <li>
          <a class="dropdown-item" href="{{ route('profile') }}">
            <i class="icon-base ri ri-user-3-line icon-22px me-2"></i>
            <span class="align-middle">My Profile</span>
          </a>
        </li>
        <li><div class="dropdown-divider my-1"></div></li>
        <li>
          <div class="d-grid px-4 pt-2 pb-1">
            <form method="POST" action="{{ route('logout') }}">
              @csrf
              <button type="submit" class="btn btn-danger d-flex w-100 justify-content-center">
                <small class="align-middle">Logout</small>
                <i class="icon-base ri ri-logout-box-r-line ms-2 icon-16px"></i>
              </button>
            </form>
          </div>
        </li>
        @else
        <li>
          <div class="d-grid px-4 pt-2 pb-1">
            <a class="btn btn-primary d-flex justify-content-center" href="{{ route('login') }}">
              <small class="align-middle">Login</small>
            </a>
          </div>
        </li>
        @endauth
      </ul>
    </li>
    <!--/ User Dropdown -->

  </ul>
</div>

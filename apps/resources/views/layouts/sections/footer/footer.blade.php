@php
  $containerFooter =
      isset($configData['contentLayout']) && $configData['contentLayout'] === 'compact'
          ? 'container-xxl'
          : 'container-fluid';
@endphp

<!-- Footer-->
<footer class="content-footer footer bg-footer-theme">
  <div class="{{ $containerFooter }}">
    <div class="footer-container d-flex align-items-center justify-content-between py-4 flex-md-row flex-column">
      <div class="mb-2 mb-md-0">
        &copy; <script>document.write(new Date().getFullYear());</script>
        <strong>Classroom - Akaun Simple</strong>. All rights reserved.
      </div>
      <div class="d-flex align-items-center gap-4 flex-wrap justify-content-center">
        <a href="https://wa.me/601153503022" target="_blank" class="footer-link d-flex align-items-center gap-1">
          <i class="icon-base ri ri-whatsapp-line"></i>
          <span>+601153503022</span>
        </a>
        <a href="mailto:akaunsimple.my@gmail.com" class="footer-link d-flex align-items-center gap-1">
          <i class="icon-base ri ri-mail-line"></i>
          <span>akaunsimple.my@gmail.com</span>
        </a>
      </div>
    </div>
  </div>
</footer>
<!-- / Footer -->

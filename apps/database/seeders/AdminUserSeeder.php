<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $admin = User::firstOrCreate(
            ['email' => 'admin@akaunsimple.plus'],
            [
                'name'              => 'Administrator',
                'whatsapp_number'   => '1153503022',
                'password'          => Hash::make('Admin@123456'),
                'email_verified_at' => now(),
                'is_active'         => true,
            ]
        );

        $admin->syncRoles(['admin']);
    }
}

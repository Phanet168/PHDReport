enum UserRole {
  superAdmin,
  admin,
  dataEntry,
  viewer;

  static UserRole fromString(String? v) {
    switch ((v ?? '').toLowerCase()) {
      case 'super':
      case 'superadmin':
        return UserRole.superAdmin;
      case 'admin':
        return UserRole.admin;
      case 'data-entry':
      case 'dataentry':
        return UserRole.dataEntry;
      default:
        return UserRole.viewer;
    }
  }

  String get key {
    switch (this) {
      case UserRole.superAdmin:
        return 'super';
      case UserRole.admin:
        return 'admin';
      case UserRole.dataEntry:
        return 'data-entry';
      case UserRole.viewer:
        return 'viewer';
    }
  }
}

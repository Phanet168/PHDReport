import 'package:firebase_core/firebase_core.dart';

class FirebaseBootstrap {
  static Future<void> ensureInitialized() async {
    // Uses platform config files:
    // android/app/google-services.json
    // ios/Runner/GoogleService-Info.plist
    await Firebase.initializeApp();
  }
}

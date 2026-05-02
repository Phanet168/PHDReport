import 'package:cloud_functions/cloud_functions.dart';

class FunctionsApi {
  FunctionsApi({FirebaseFunctions? fns})
      : _fns = fns ?? FirebaseFunctions.instance;
  final FirebaseFunctions _fns;

  Future<Map<String, dynamic>> adminCreateUser({
    required String email,
    String? displayName,
  }) async {
    final callable = _fns.httpsCallable('adminCreateUser');
    final res = await callable.call({
      'email': email,
      'displayName': displayName ?? '',
    });
    return Map<String, dynamic>.from(res.data as Map);
  }

  Future<Map<String, dynamic>> adminSetPassword({
    String? uid,
    String? email,
    required String newPassword,
  }) async {
    final callable = _fns.httpsCallable('adminSetPassword');
    final res = await callable.call({
      'uid': uid ?? '',
      'email': email ?? '',
      'newPassword': newPassword,
    });
    return Map<String, dynamic>.from(res.data as Map);
  }
}

///<reference types="google-one-tap" />

import { WebPlugin } from '@capacitor/core';
import { SignInResult, GoogleOneTapAuthPlugin, SignInOptions } from './definitions';
import * as scriptjs from 'scriptjs';
import jwt_decode from "jwt-decode";

// Workaround for 'error TS2686: 'google' refers to a UMD global, but the current file is a module. Consider adding an import instead.'
declare var google: {
  accounts: google.accounts
};

// See https://developers.google.com/identity/gsi/web/guides/use-one-tap-js-api
export class GoogleOneTapAuthWeb extends WebPlugin implements GoogleOneTapAuthPlugin {
  gsiScriptUrl = 'https://accounts.google.com/gsi/client';
  gapiLoadedPromise: Promise<void> = null;
  resolveGapiLoaded: () => void;
  signInPromise: Promise<SignInResult>;
  resolveSignInPromise: (user: SignInResult) => void;
  rejectSignInPromise: (reason?: any) => void;
  authenticatedUserId: string = null;

  initialize(): Promise<void> {
    if (this.gapiLoadedPromise == null) {
      this.gapiLoadedPromise = new Promise<void>((resolve) => {
        this.resolveGapiLoaded = resolve;
      });
      this.loadScript();
    }
    return this.gapiLoadedPromise;
  }

  private loadScript() {
    scriptjs.get(this.gsiScriptUrl, () => {
      this.resolveGapiLoaded();
    });
  }

  tryAutoSignIn(options: SignInOptions): Promise<SignInResult> {
    this.initializeSignInPromise();
    this.doSignIn(options, true);
    return this.signInPromise;
  }

  async trySignInWithPrompt(options: SignInOptions): Promise<SignInResult> {
    this.initializeSignInPromise();
    this.doSignIn(options, false);
    return this.signInPromise;
  }

  async tryAutoSignInThenSignInWithPrompt(options: SignInOptions): Promise<SignInResult> {
    this.initializeSignInPromise();
    try {
      await this.doSignIn(options, true);
    }
    catch {
      await this.doSignIn(options, false);
    }
    return this.signInPromise;
  }

  renderButton(parentElementId: string, options?: google.GsiButtonConfiguration): Promise<SignInResult> {
    const parentElem = document.getElementById(parentElementId);
    if (!parentElem) {
      return Promise.reject(`Element with id ${parentElementId} was not found.`);
    }
    this.initializeSignInPromise();

    google.accounts.id.renderButton(
       parentElem!,
       options || {}
     );

     return this.signInPromise;
  }

  private initializeSignInPromise() {
    this.signInPromise = new Promise<SignInResult>((resolve, reject) => {
      this.resolveSignInPromise = resolve;
      this.rejectSignInPromise = reject;
    });
  }

  private async doSignIn(options: SignInOptions, autoSelect: boolean) {
    if (!options.clientId) {
      this.rejectSignInPromise('GoogleOneTapAuthPlugin(web).doSignIn - options.clientId is empty');
      return;
    }

    try {
      await this.initialize();

      google.accounts.id.initialize({
        client_id: options.clientId,
        callback: this.handleCredentialResponse.bind(this),
        auto_select: autoSelect,
        itp_support: options.webOptions?.itpSupport || false,
        cancel_on_tap_outside: false,
        ux_mode: options.webOptions?.uxMode || 'popup',
      });

      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed()) {
          this.rejectSignInPromise('GoogleOneTapAuthPlugin(web).doSignIn - login not displayed. Reason: ' + notification.getNotDisplayedReason());
        }
        else if (notification.isSkippedMoment()) {
          this.rejectSignInPromise('GoogleOneTapAuthPlugin(web).doSignIn - login was skipped. Reason: ' + notification.getSkippedReason());
        }
        else if (notification.isDismissedMoment()) {
          this.rejectSignInPromise('GoogleOneTapAuthPlugin(web).doSignIn - login was dismissed. Reason: ' + notification.getDismissedReason());
        }
      });
    }
    catch (error) {
      this.rejectSignInPromise(error);
    }
  }

  // todo return CredentialResponse instead of User
  private handleCredentialResponse(credentialResponse: google.CredentialResponse) {
    let user: SignInResult = {
      //id: '',
      idToken: credentialResponse.credential,
      // displayName: '',
      // givenName: '',
      // familyName: '',
      // profilePictureUri: ''
    };
    const decoded = jwt_decode(credentialResponse.credential) as any;
    this.authenticatedUserId = decoded['sub'] as string;
    console.log(decoded);
    this.resolveSignInPromise(user);
  }

  signOut(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      google.accounts.id.cancel();

      // When the user signs out of your website, you need to call the method disableAutoSelect to record the status in cookies. This prevents a UX dead loop. 
      google.accounts.id.disableAutoSelect();

      if (this.authenticatedUserId) {
        // Calling revoke method revokes all OAuth2 scopes previously granted by the Sign In With Google client library.
        google.accounts.id.revoke(this.authenticatedUserId, response => {
          if (response.successful) {
            resolve();
          }
          else {
            reject(response.error);
          }
        });
        this.authenticatedUserId = null;
      } else {
        resolve();
      }
    });
  }

  // private getUserFrom(googleUser: gapi.auth2.GoogleUser) {
  //   const user = {} as User;
  //   const profile = googleUser.getBasicProfile();

  //   // user.email = profile.getEmail();
  //   // user.familyName = profile.getFamilyName();
  //   // user.givenName = profile.getGivenName();
  //   user.id = profile.getId();
  //   // user.imageUrl = profile.getImageUrl();
  //   // user.name = profile.getName();

  //   //const authResponse = googleUser.getAuthResponse(true);
  //   // user.authentication = {
  //   //   accessToken: authResponse.access_token,
  //   //   idToken: authResponse.id_token,
  //   //   refreshToken: '',
  //   // };

  //   return user;
  // }
}

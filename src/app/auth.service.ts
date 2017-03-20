import { Router,
         ActivatedRouteSnapshot,
         RouterStateSnapshot }    from '@angular/router';
import { Injectable, enableProdMode }      from '@angular/core';
import { tokenNotExpired } from 'angular2-jwt';
import { myConfig }        from './auth.config';
import { User } from './user/common/user';
import { UserService } from './user/common/user.service';
import 'rxjs/add/operator/switchMap';
import 'rxjs/add/operator/take';
import { environment } from '../environments/environment';
import { AppRoles } from './roles';

declare const Auth0Lock: any;
declare const Auth0: any; // being used for parsing hash 

@Injectable()
export class AuthService {

  userProfile: any;  
  userName: string;
  userRole: string;
  email: string;
  firstName: string;
  lastName: string;

  // These options are being added to customize signup
  options = {
    // No login after email/pwd signup
    loginAfterSignUp: false,
    // Override the Auth0 logo
    theme:  {
      logo: '../assets/favicon-32x32.png'
            },
    // Override the title        
    languageDictionary: {
      title: "Code for Social Good"
    },   
    auth : {
        params: {scope: 'openid email user_metadata app_metadata'},
    },
    // Add a user name input text       
    additionalSignUpFields: [{
      name: "user_name",
      placeholder: "User name",
      validator: function(user_name) {
        return {
          valid: user_name.length >= 8,
          hint: "Must have 8 or more chars"
        }
      } },
      // Add a User role selection of either Volunteer or NonProfit 
      {
        type: "select",
        name: "user_role",
        placeholder: "Sign up as a",
        options: [
          {value: "VOLUNTEER", label: "Volunteer User"},
          {value: "ORGANIZATION", label: "Non-profit User"},
          {value: "C4SG_ADMIN", label: "Admin User"}
        ],
        prefill: "VOLUNTEER"
      }
    ]
  };

  // Configure Auth0 with options
  lock = new Auth0Lock(environment.auth_clientID, environment.auth_domain, this.options);
  auth0 = new Auth0({clientID: environment.auth_clientID, domain: environment.auth_domain});
  
  constructor(private userService: UserService, private router: Router) {    

    // set uset profile of already saved profile
    this.userProfile = JSON.parse(localStorage.getItem('profile'));

    // Add callback for lock `authenticated` event
    this.lock.on('authenticated', (authResult) => {
      localStorage.setItem('id_token', authResult.idToken);
      localStorage.setItem('accessToken', authResult.accessToken);      

      // console.log(authResult);

      // Get the user profile
      this.lock.getUserInfo(authResult.accessToken,  (error, profile) => {
        let user;
        if (!error) {
          // Signed up via email/pwd
          if (!profile.identities[0].isSocial) {
            this.userName = profile.user_metadata.user_name;
            this.userRole = profile.app_metadata.roles[0];
          } // Signed up via social providers
          else{
            this.userName = profile.email;
            //ATM: assumption is there will always be only 1 role per user
            this.userRole = profile.app_metadata.roles[0];
            this.firstName = profile.given_name;
            this.lastName = profile.family_name;
          }
        
          // Store user profile
          localStorage.setItem('profile', JSON.stringify(profile));
          this.userProfile = profile;          

          // console.log('Printing userprofile');
          // console.log(this.userProfile);

          this.email = profile.email;
          
          userService.getUserByEmail(this.email).subscribe(    
            res => {
              let lemail = this.email;
              let luserRole = this.userRole;
              let luserName = this.userName;
              let firstName =  this.firstName !== undefined ? this.firstName : ''; 
              let lastName =  this.lastName !== undefined ? this.lastName : '';

              if (JSON.parse(JSON.stringify(res))._body !== "")
              {
                // console.log("found an existing user by email");
                // console.log(JSON.stringify(res));
                user = JSON.parse(JSON.parse(JSON.stringify(res))._body);    
              }              
              // If not found, then create the user
              if (user === undefined)
              {
                console.log("User does not exist");
                let newUser = new User(0, 
                  lemail, 'NA', 
                  'NA', 'NA','NA',
                  'ACTIVE',luserRole.toUpperCase(), 
                  "99","1",null,null, luserName, firstName, lastName);
                
                // Create a user
                userService.add(newUser).subscribe(
                  res => {
                    user = JSON.parse(JSON.stringify(res));
                    // console.log("Added new user : ");
                    // console.log(JSON.stringify(user));

                    localStorage.setItem('currentUserId', user.id);
                    if (user.firstName !== '' && user.lastName !== '') {
                      localStorage.setItem('currentDisplayName', user.firstName + ' ' + user.lastName);
                    }
                    else{
                      localStorage.setItem('currentDisplayName', user.email);
                    }                    
                  },
                  error => console.log(error));
              }
              else {
                // Store user id and display name
                localStorage.setItem('currentUserId', user.id);
                if (user.firstName !== '' && user.lastName !== '') {
                  localStorage.setItem('currentDisplayName', user.firstName + ' ' + user.lastName);
                }
                else {
                  localStorage.setItem('currentDisplayName', user.email);
                }

                  // console.log("User already exists: " + 
                    // user.email + ' and user id: ' +
                    // user.id + ' name: ' +
                    // localStorage.getItem('currentDisplayName'));
              }
            },
            error => console.log(error)
          );
        }
      });
    });

    //check for redirections with hash
    this.handleRedirectWithHash();

    // Function call to show errors
    let llock = this.lock;
    this.lock.on("authorization_error", function(error) {
    console.log('AuthZ error', error);
    llock.show({
        flashMessage:{
            type: 'error',
            text: error.error_description
        }});
    })

    
  }

  public login() {
    // Call the show method to display the widget.
    this.lock.show();
  }

  public authenticated() {
    // Check if there's an unexpired JWT
    // It searches for an item in localStorage with key == 'id_token'
    return tokenNotExpired();
  }

  public logout() {
    // Remove token from localStorage
    localStorage.removeItem('id_token');
    localStorage.removeItem('profile');
    localStorage.removeItem('accessToken');
    localStorage.removeItem('oAuthState');
    localStorage.clear();
    this.router.navigate(['']);
    this.userProfile = undefined;
  }

  // Returns user profile
  getProfile(): any {
      return localStorage.getItem('profile');
  }

  // Returns current user's application user id
  getCurrentUserId() {
    return localStorage.getItem('currentUserId');
  }

  // Returns current user's first name + last name OR email 
  getCurrentDisplayName() {
    return localStorage.getItem('currentDisplayName');
  }

  // Code below is used to override role
  bypassRole(roleToCheck: string): boolean {
    // For prod, this override will not function
    if (!environment.production) {
      // If a user decides to override, the 'bypassRole is set to true'
      if (myConfig.bypassRole) {
        // If a bypass is set then an override 'roleAs' is expected 
        if (roleToCheck === myConfig.roleAs) {
          return true;
        }
        return false;
      }
      return false; 
    }
    return false;
  }

  // Common check if a user profile exists and has application metadata
  public hasRoles() {   
    return this.userProfile && this.userProfile.app_metadata
      && this.userProfile.app_metadata.roles;
  }

  // Check if a user's role is ADMIN
  public isAdmin() {
    if (this.hasRoles()) {
      //against AppRoles.ADMIN
      if (this.bypassRole(AppRoles[0])) {
        return true;
      }
      else{
        return this.userProfile.app_metadata.roles.indexOf(AppRoles[0]) > -1;
      }
    } 
    return false; 
  }

  // Check if a user's role is VOLUNTEER
  public isVolunteer() {
    if (this.hasRoles()) {
      //against AppRoles.VOLUNTEER
      if (this.bypassRole(AppRoles[1])) {
        return true;
      }
      else{
        return this.userProfile.app_metadata.roles.indexOf(AppRoles[1]) > -1;
      }
    } 
    return false; 
  }

  // Check if a user's role is ORGANIZATION
  public isOrganization() {
    if (this.hasRoles()) {
      //against AppRoles.ORGANIZATION
      if (this.bypassRole(AppRoles[2])) {
        return true;
      }
      else{
        return this.userProfile.app_metadata.roles.indexOf(AppRoles[2]) > -1;
      }
    } 
    return false; 
  }

  // Used to handle checking for redirection with hash enabled
  private handleRedirectWithHash() {
    //console.log('inside handle redirect');
    this.router.events.take(1).subscribe(event => {
      if (/access_token/.test(event.url) || /error/.test(event.url)) {  
        let authResult = this.auth0.parseHash(window.location.hash);
        if (authResult && authResult.idToken) {
          this.lock.emit('authenticated', authResult);
        }

        if (authResult && authResult.error) {
          this.lock.emit('authorization_error', authResult);
        }
        // Needed to add this to override redirection since angular thinks
        // it is suppose to go to a route named "access_token" 
        this.router.navigate(['']);
      }
      else if (/roleselect/.test(event.url)) {  
        let authResult = this.auth0.parseHash(window.location.search);
        // console.log(window.location.search);
        // use the window.location.search to extract the query params
        var urlstring = window.location.search;
        var stateoffset = urlstring.indexOf('state=');
        var statestr = urlstring.slice(stateoffset + 6);

          localStorage.setItem('oAuthState', statestr);
          // console.log('staterole: ' + localStorage.getItem('stateRole'));
          this.router.navigate(['/roleselect']);
      }
    });
  }
}
